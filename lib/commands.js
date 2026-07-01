// Empire MD - Command Router & Loader
const fs = require('fs');
const path = require('path');

const commands = {};

// Load all command files from the commands folder
const commandsDir = path.join(__dirname, '../commands');
if (fs.existsSync(commandsDir)) {
    fs.readdirSync(commandsDir).forEach(file => {
        if (!file.endsWith('.js')) return;
        try {
            const commandFile = require(path.join(commandsDir, file));
            const names = Object.keys(commandFile);
            names.forEach(cmdName => {
                if (typeof commandFile[cmdName] === 'function') {
                    if (commands[cmdName]) {
                        console.warn(`⚠️ Duplicate command "${cmdName}" in ${file} — overriding previous definition.`);
                    }
                    commands[cmdName] = commandFile[cmdName];
                }
            });
            console.log(`✅ Loaded ${names.length} command(s) from ${file}`);
        } catch (err) {
            console.error(`❌ Failed to load command file ${file}:`, err.message);
        }
    });
}

console.log(`📦 Total commands registered: ${Object.keys(commands).length}`);
console.log(`🧭 Commands: ${Object.keys(commands).sort().join(", ")}`);

module.exports = commands;
