const { Client } = require('whatsapp-web.js');
const { LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');


const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});



// R

// Listening to all incoming messages
client.on('message_create', message => {
    console.log(message);
	console.log(message.body);
});


client.initialize();
