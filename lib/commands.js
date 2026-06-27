// Empire MD - Command Router & Loader
const fs = require('fs');
const path = require('path');

const commands = {};

// Load all command files from commands folder
const commandsDir = path.join(__dirname, '../commands');
if (fs.existsSync(commandsDir)) {
    fs.readdirSync(commandsDir).forEach(file => {
        if (file.endsWith('.js')) {
            const commandFile = require(path.join(commandsDir, file));
            Object.keys(commandFile).forEach(cmdName => {
                commands[cmdName] = commandFile[cmdName];
            });
        }
    });
}

module.exports = commands;