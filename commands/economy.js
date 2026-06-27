// Economy, Bank, and Coins system
const economyDb = {};

module.exports = {
    // 💰 Check Wallet Balance (Alias: bal, balance, wallet)
    bal: async ({ sock, chatJid, mek, sender, senderName }) => {
        if (!economyDb[sender]) {
            economyDb[sender] = { wallet: 1000, bank: 5000 };
        }
        const userEco = economyDb[sender];
        const msg = `💰 *[EMPIRE ECONOMY]* 💰
👤 *Account:* ${senderName}
💵 *Wallet:* $${userEco.wallet}
🏦 *Bank:* $${userEco.bank}
💳 *Total Net:* $${userEco.wallet + userEco.bank}`;
        await sock.sendMessage(chatJid, { text: msg }, { quoted: mek });
    },
    balance: async (args) => module.exports.bal(args),
    wallet: async (args) => module.exports.bal(args),

    // 🎰 Casino / Slot Machine Game (Alias: slot, slots, casino)
    slot: async ({ sock, chatJid, mek, sender, args }) => {
        if (!economyDb[sender]) {
            economyDb[sender] = { wallet: 1000, bank: 5000 };
        }
        const userEco = economyDb[sender];
        const bet = args[0] ? parseInt(args[0]) : 100;
        
        if (isNaN(bet) || bet <= 0) {
            return sock.sendMessage(chatJid, { text: "❌ Provide a valid amount to bet!" }, { quoted: mek });
        }
        if (userEco.wallet < bet) {
            return sock.sendMessage(chatJid, { text: "❌ Insufficient coins in your wallet!" }, { quoted: mek });
        }

        userEco.wallet -= bet;
        const items = ['🍒', '🍋', '🍇', '💎', '🔔'];
        const c1 = items[Math.floor(Math.random() * items.length)];
        const c2 = items[Math.floor(Math.random() * items.length)];
        const c3 = items[Math.floor(Math.random() * items.length)];

        let winnings = 0;
        let resultMsg = "";
        
        if (c1 === c2 && c2 === c3) {
            winnings = bet * 5;
            userEco.wallet += winnings;
            resultMsg = `🎉 *JACKPOT! Match 3!* You won $${winnings}!`;
        } else if (c1 === c2 || c2 === c3 || c1 === c3) {
            winnings = Math.floor(bet * 1.5);
            userEco.wallet += winnings;
            resultMsg = `📈 *Match 2!* You won $${winnings}!`;
        } else {
            resultMsg = "📉 *No matches!* You lost your bet.";
        }

        const spinText = `🎰 *[EMPIRE CASINO]* 🎰
━━━━━━━━━━━━━━━━━━━━
      [ ${c1} | ${c2} | ${c3} ]
━━━━━━━━━━━━━━━━━━━━
${resultMsg}
💰 *New Wallet Balance:* $${userEco.wallet}`;

        await sock.sendMessage(chatJid, { text: spinText }, { quoted: mek });
    },
    slots: async (args) => module.exports.slot(args),

    // 🎁 Claim Daily Reward (Alias: daily)
    daily: async ({ sock, chatJid, mek, sender }) => {
        if (!economyDb[sender]) {
            economyDb[sender] = { wallet: 1000, bank: 5000 };
        }
        const userEco = economyDb[sender];
        const reward = 500;
        userEco.wallet += reward;

        await sock.sendMessage(chatJid, { text: `🎁 *Daily Reward Claimed!* 
Added *$${reward}* to your wallet. Balance: *$${userEco.wallet}*` }, { quoted: mek });
    }
};