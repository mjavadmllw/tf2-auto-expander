const SteamUser = require("steam-user");
const TF2 = require("tf2");
const readline = require("readline");
const config = require("./config.json");
const fs = require("fs");
const path = require("path");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const client = new SteamUser();
const tf2 = new TF2(client);

// ==================== LOGGING SETUP ====================
const LOGS_DIR = path.join(__dirname, "logs");

// ایجاد فولدر logs اگر وجود نداشته باشد
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(`Created logs directory: ${LOGS_DIR}`);
}

// ساخت نام فایل لاگ: logs/2025-11-05_14-30-25.log
const startTime = new Date();
const timestamp = startTime.toISOString().replace(/[:.]/g, "-").split("T");
const logFileName = `${timestamp[0]}_${timestamp[1].split(".")[0]}.log`;
const LOG_FILE = path.join(LOGS_DIR, logFileName);

// ایجاد استریم نوشتن در فایل
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

// تابع کمکی برای فرمت زمانی — هر بار زمان جدید
function getTimestamp() {
  const current = new Date();
  return current.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// بازنویسی console.log و console.error
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
  const message = args.map(arg => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg))).join(" ");
  const logMessage = `[${getTimestamp()}] ${message}\n`;
  logStream.write(logMessage);
  originalLog.apply(console, args);
};

console.error = function (...args) {
  const message = args.map(arg => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg))).join(" ");
  const logMessage = `[${getTimestamp()}] [ERROR] ${message}\n`;
  logStream.write(logMessage);
  originalError.apply(console, args);
};

// پیام شروع لاگ
console.log(`Logging started to: ${LOG_FILE}`);
console.log("=".repeat(60));
// ======================================================

let initialSlots = 0;
let dataLoaded = false; // flag برای اطمینان از لود account و backpack

// ---- Login ----
client.logOn({
  accountName: config.USERNAME,
  password: config.PASSWORD,
});

client.on("loggedOn", () => {
  console.log(`✅ Logged into Steam as ${client.steamID.getSteamID64()}`);
  client.setPersona(SteamUser.EPersonaState.Online);
  client.gamesPlayed([440]); // Team Fortress 2
});

client.on("steamGuard", (domain, callback) => {
  const prompt = domain
    ? "🔐 Enter Steam Guard code from your EMAIL: "
    : "🔐 Enter Steam Guard code from your MOBILE APP: ";
  rl.question(prompt, (code) => callback(code.trim()));
});

client.on("error", (err) => console.error("⚠️ Steam Error:", err));
tf2.on("error", (err) => console.error("⚠️ TF2 Error:", err));

// ---- TF2 Events ----
tf2.on("connectedToGC", () => {
  console.log("🎮 Connected to TF2 Game Coordinator.");
});

tf2.on("backpackLoaded", () => {
  console.log("🎒 TF2 Backpack Loaded");
  if (tf2.backpack?.length) {
    fs.writeFileSync("backpack.json", JSON.stringify(tf2.backpack, null, 2));
    console.log(`📁 Saved ${tf2.backpack.length} items to backpack.json`);
  }
  checkDataLoaded();
});

tf2.on("accountLoaded", () => {
  console.log("👤 Account data loaded");
  console.log(`📦 Backpack Slots: ${tf2.backpackSlots}`);
  initialSlots = tf2.backpackSlots;
  if (tf2.premium) console.log("💎 Account type: Premium");
  else console.log("🪙 Account type: Free-to-play");
  checkDataLoaded();
});

// جدید: برای تشخیص تغییر slots خودکار
tf2.on("accountUpdate", (oldData) => {
  if (oldData.backpackSlots !== undefined) {
    console.log(`✅ Backpack expanded! Slots: ${oldData.backpackSlots} → ${tf2.backpackSlots}`);
    initialSlots = tf2.backpackSlots;
    checkForExpanders(); // چک برای بعدی
  }
});

// جدید: برای تایید حذف expander
tf2.on("itemRemoved", (item) => {
  if (item.defindex === 5050) {
    console.log(`🧳 Backpack Expander (id: ${item.id}) used and removed.`);
  }
});

// ---- Helper ----
function checkDataLoaded() {
  if (tf2.backpack && tf2.backpackSlots !== undefined) {
    if (!dataLoaded) {
      dataLoaded = true;
      checkForExpanders();
    }
  }
}

function checkForExpanders() {
  if (!tf2.backpack || tf2.backpack.length === 0) {
    console.log("⏳ Backpack not loaded yet...");
    setTimeout(checkForExpanders, 5000);
    return;
  }

  // چک max slots
  const maxSlots = tf2.premium ? 4000 : 3750;
  if (tf2.backpackSlots >= maxSlots) {
    console.log(`⚠️ Maximum slots reached (${maxSlots}). Cannot use more expanders.`);
    askToCheckAgain();
    return;
  }

  const expanders = tf2.backpack.filter((item) => item.def_index === 5050);
  if (expanders.length === 0) {
    console.log("❌ No Backpack Expander found in your inventory.");
    askToCheckAgain();
    return;
  }

  console.log(`🧳 Found ${expanders.length} Backpack Expander(s).`);
  const expander = expanders[0];
  rl.question("❓ Do you want to use a Backpack Expander? (y/n): ", (answer) => {
    if (answer.toLowerCase() === "y") {
      useExpander(expander);
    } else {
      console.log("❎ Operation cancelled by user.");
      askToCheckAgain();
    }
  });
}

// ---- Use Expander ----
function useExpander(expander) {
  if (!tf2.haveGCSession) {
    console.log("⚠️ Not connected to GC yet. Retrying in 5s...");
    setTimeout(() => useExpander(expander), 5000);
    return;
  }

  console.log(`🔧 Trying to use Backpack Expander... (item_id: ${expander.id})`);
  try {
    tf2.useItem(expander.id);
    // موفقیت حالا با ایونت‌ها تشخیص داده می‌شه (accountUpdate و itemRemoved)
    // fallback چک manual (ide اگر ایونت نیاد
    setTimeout(() => {
      if (tf2.backpack.some((i) => i.id === expander.id)) {
        console.log("⚠️ Expander still in inventory. Possible failure.");
        askToCheckAgain();
      }
    }, 10000); // 10s fallback
  } catch (err) {
    console.error("❌ Failed to trigger item use:", err);
    askToCheckAgain();
  }
}

// ---- Ask to recheck ----
function askToCheckAgain() {
  rl.question(
    "❓ You are about to leave, Do you want to check again? (y/n): ",
    (answer) => {
      if (answer.toLowerCase() === "y") {
        console.log("🔄 Checking again...");
        setTimeout(() => checkForExpanders(), 3000);
      } else {
        console.log("👋 Logging out...");
        client.logOff();
        rl.close();
        logStream.end();
        process.exit(0);
      }
    }
  );
}

process.on("exit", () => {
  logStream.end();
});
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  client.logOff();
  rl.close();
  logStream.end();
  process.exit(0);
});