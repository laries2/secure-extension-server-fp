const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const keysFilePath = path.join(__dirname, "keys.json");

// 🔹 Load keys
function loadKeys() {
    if (!fs.existsSync(keysFilePath)) {
        fs.writeFileSync(keysFilePath, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(keysFilePath));
}

// 🔹 Save keys
function saveKeys(data) {
    fs.writeFileSync(keysFilePath, JSON.stringify(data, null, 2));
}

// 🔑 Generate random key
function generateKey() {
    return "user_" + Math.random().toString(36).substring(2, 10);
}

// 📅 Expiry generator
function getExpiry(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split("T")[0];
}

// ==============================
// 🔐 MAIN LICENSE CHECK (WITH FP)
// ==============================
app.get("/script", (req, res) => {
    try {
        const key = req.query.key;
        const fingerprint = req.query.fp;

        if (!fingerprint) {
            return res.json({ allowed: false, kill: false });
        }

        const keys = loadKeys();
        const user = keys[key];

        console.log("🔑 Request:", key);

        const GLOBAL_KILL = false;

        if (GLOBAL_KILL) {
            return res.json({ allowed: false, kill: true });
        }

        if (!user) return res.json({ allowed: false, kill: false });
        if (!user.active) return res.json({ allowed: false, kill: false });

        const now = new Date();
        const expiry = new Date(user.expires);

        if (now > expiry) {
            return res.json({ allowed: false, kill: false });
        }

        // 🔐 Ensure devices array exists
        if (!user.devices) {
            user.devices = [];
        }

        // 🔐 FIRST DEVICE REGISTER
        if (user.devices.length === 0) {
            user.devices.push(fingerprint);
            saveKeys(keys);
            console.log("🔒 First device registered");
        }

        // 🔐 DEVICE VALIDATION
        if (!user.devices.includes(fingerprint)) {

            if (user.devices.length >= 2) {
                console.log("🚫 Too many devices");
                return res.json({ allowed: false, kill: false });
            }

            user.devices.push(fingerprint);
            saveKeys(keys);
            console.log("➕ New device added");
        }

        res.json({ allowed: true, kill: false });

    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ allowed: false, kill: false });
    }
});

// ==============================
// 🔑 GENERATE KEY (ADMIN)
// ==============================
app.get("/generate-key", (req, res) => {

    const adminKey = req.query.admin;
    if (adminKey !== "MY_SECRET_ADMIN") {
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
        devices: [] // 🔥 important
    };

    saveKeys(keys);

    res.json({
        key: newKey,
        expires: keys[newKey].expires
    });
});

// ==============================
// ❌ REVOKE KEY (ADMIN)
// ==============================
app.get("/revoke-key", (req, res) => {

    const adminKey = req.query.admin;
    if (adminKey !== "MY_SECRET_ADMIN") {
        return res.status(403).send("Unauthorized");
    }

    const key = req.query.key;
    const keys = loadKeys();

    if (!keys[key]) {
        return res.status(404).send("Key not found");
    }

    keys[key].active = false;
    saveKeys(keys);

    res.json({
        success: true,
        message: "Key revoked"
    });
});

// ==============================
// 🚀 START SERVER
// ==============================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});