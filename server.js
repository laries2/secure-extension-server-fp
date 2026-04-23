const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors({
    origin: "https://ai.joinhandshake.com"
}));

const keysFilePath = path.join(__dirname, "keys.json");

// Load keys
function loadKeys() {
    if (!fs.existsSync(keysFilePath)) {
        fs.writeFileSync(keysFilePath, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(keysFilePath));
}

// Save keys
function saveKeys(data) {
    fs.writeFileSync(keysFilePath, JSON.stringify(data, null, 2));
}

// Generate key
function generateKey() {
    return "user_" + Math.random().toString(36).substring(2, 10);
}

// Expiry
function getExpiry(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split("T")[0];
}

// 🚀 MAIN CONTROL ENDPOINT
app.get("/script", (req, res) => {
    const key = req.query.key;
    const fp = req.query.fp;

    const keys = loadKeys();
    const user = keys[key];

    console.log("Key:", key, "| FP:", fp);

    // 🚫 Reject missing fingerprint
    if (!fp) {
        return res.json({
            allowed: false,
            config: { blockModal: false }
        });
    }

    // ❌ Invalid / revoked
    if (!user || !user.active) {
        return res.json({
            allowed: false,
            config: { blockModal: false }
        });
    }

    const now = new Date();
    const expiry = new Date(user.expires);

    // ❌ Expired
    if (now > expiry) {
        return res.json({
            allowed: false,
            config: { blockModal: false }
        });
    }

    // 🔐 STRICT ONE DEVICE LOCK
    if (!user.fingerprint) {
        // ✅ First device registers
        user.fingerprint = fp;
        saveKeys(keys);
        console.log("🔒 Device registered:", fp);

    } else if (user.fingerprint !== fp) {
        // 🚫 Different device → BLOCK
        console.log("🚫 Fingerprint mismatch → access denied");

        return res.json({
            allowed: false,
            config: { blockModal: false }
        });
    }

    // ✅ Allowed (same device only)
    return res.json({
        allowed: true,
        config: { blockModal: true }
    });
});

// 🔑 Generate key
app.get("/generate-key", (req, res) => {
    if (req.query.admin !== "MY_SECRET_ADMIN") {
        return res.status(403).send("Unauthorized");
    }

    const days = parseInt(req.query.days) || 30;
    const keys = loadKeys();

    let newKey;
    do {
        newKey = generateKey();
    } while (keys[newKey]);

    keys[newKey] = {
        expires: getExpiry(days),
        active: true,
        fingerprint: null
    };

    saveKeys(keys);

    res.json({
        key: newKey,
        expires: keys[newKey].expires
    });
});

// ❌ Revoke key
app.get("/revoke-key", (req, res) => {
    if (req.query.admin !== "MY_SECRET_ADMIN") {
        return res.status(403).send("Unauthorized");
    }

    const key = req.query.key;
    const keys = loadKeys();

    if (!keys[key]) return res.status(404).send("Key not found");

    keys[key].active = false;
    saveKeys(keys);

    res.send("Key revoked");
});

// 🔓 Unrevoke key
app.get("/unrevoke-key", (req, res) => {
    if (req.query.admin !== "MY_SECRET_ADMIN") {
        return res.status(403).send("Unauthorized");
    }

    const key = req.query.key;
    const keys = loadKeys();

    if (!keys[key]) {
        return res.status(404).send("Key not found");
    }

    keys[key].active = true;

    // 🔁 OPTIONAL: reset fingerprint (recommended)
    keys[key].fingerprint = null;

    saveKeys(keys);

    res.send("Key restored");
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});