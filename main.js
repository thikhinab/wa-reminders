import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { createTasks, getTasks, createReminderFromTask, getReminderByTaskId, updateReminder, getUpcomingRemindersDueToday, getSentReminders, getTaskById, getCurrentDateTimeString } from './db.js';
import { logger } from './logger.js';
import tasks from './tasks.json' with { type: 'json' };
import { getChatId, saveChatId } from './db.js';
import dotenv from 'dotenv';
dotenv.config();
export let CHAT_ID = null;
export const GROUP_NAME = 'Our Reminders';

const client = new Client({
    authStrategy: new LocalAuth()
});

client.initialize();

const MENTION_NUMBERS = process.env.MENTION_NUMBERS?.split(',') ?? [];
logger.info(`Mention numbers are ${JSON.stringify(MENTION_NUMBERS)}`);

client.on('ready', async () => {
    logger.info('Client is ready!');
    // Check if the client is already authenticated
    // Load the chat id
    await loadChatId();

    // create the tasks if they don't exist
    createTasks(tasks);

    // Check for completed reminders
    await handleCompletedReminders();

    // create the reminders if they don't exist (must finish before we send)
    await createReminders();

    // process the reminders
    await sendReminders();
});


async function handleCompletedReminders() {
    // Get the completed reminders from the db
    const completedReminders = await getSentReminders(getCurrentDateTimeString());
    for (const reminder of completedReminders) {
        // Check if the message has a thumbs up reaction
        const message = await client.getMessageById(reminder.message_id);
        if (!message) {
            logger.error(`Message ${reminder.message_id} not found`);
        }
        
        const reactions = await message.getReactions();
        logger.info(`Reactions for message ${reminder.message_id} are ${JSON.stringify(reactions)}`);
        const hasThumbsUp = reactions?.some(r => r.aggregateEmoji === '👍');
        if (hasThumbsUp) {
            logger.info(`Message ${reminder.message_id} has a thumbs up reaction, marking reminder completed`);
            // mark reminder completed
            updateReminder(reminder.id, reminder.message_id, 'completed');  // or whatever your signature is
        } else {
            logger.info(`Message ${reminder.message_id} does not have a thumbs up reaction, skipping`);
        }
    }
}


async function createReminders() {
    // Get the tasks from the db
    const tasks = await getTasks();

    // For each task check if there is a reminder if not create it. (Can be for the future)
    for (const task of tasks) {
        // check if there is a reminder for the task
        const reminder = await getReminderByTaskId(task.id);
        if (!reminder) {
            logger.info(`No reminder found for task ${task.id}, creating it`);
            // create the reminder
            createReminderFromTask(task);
        } else {
            logger.info(`Reminder found for task ${task.id}, skipping`);
        }
    }
}


async function sendReminders() {
    // Get the reminders from the db
    const reminders = await getUpcomingRemindersDueToday();
    for (const reminder of reminders) {
        // send the reminder
        const task = await getTaskById(reminder.task_id);
        // Only add description if it exists
        const description = task.description ? `: ${task.description}` : '';
        let response = await client.sendMessage(CHAT_ID, `Reminder for task ${task.title}${description} @${MENTION_NUMBERS.join(', @')}`, {
            mentions: MENTION_NUMBERS.map(number => `${number}@c.us`)
        });
        // Update the reminder with the message id and status
        updateReminder(reminder.id, response.id._serialized, 'sent');
    }

    // Resend the reminders that are yet to be completed.
    // Get all messages that are sent before 00:00:00 of the current day
    const sentBefore = new Date()
    // Convert to ISO string and replace the Z with +00:00
    sentBefore.setUTCHours(0, 0, 0, 0);
    const sentBeforeISO = sentBefore.toISOString().replace('Z', '+00:00');
    const sentReminders = await getSentReminders(sentBeforeISO);
    for (const reminder of sentReminders) {
        // send the reminder
        const task = await getTaskById(reminder.task_id);
        // Only add description if it exists
        const description = task.description ? `: ${task.description}` : '';
        let response = await client.sendMessage(CHAT_ID, `New reminder for task ${task.title}${description} @${MENTION_NUMBERS.join(', @')}`, {
            mentions: MENTION_NUMBERS.map(number => `${number}@c.us`)
        });
        // Update the reminder with the message id and status
        updateReminder(reminder.id, response.id._serialized, 'sent');
    }
}



// Get chat id from name (use after client is ready)
async function getChatIdUsingClient() {
    const chats = await client.getChats();
    const group = chats.find(c => c.name === GROUP_NAME);
    const groupId = group?.id._serialized;
    console.log('Group ID:', groupId);
    return groupId;
}


async function loadChatId() {
    // Check DB for the chat id if it exists, if not, save it
    let chatId = await getChatId();
    if (!chatId) {
        logger.info('Chat id not found in DB, getting it from name');
        chatId = await getChatIdUsingClient();
        saveChatId(chatId, GROUP_NAME);
    }
    logger.info(`Chat id is ${chatId}`);
    CHAT_ID = chatId;
}





client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});


// // Listening to all incoming messages
// client.on('message_create', message => {
//     console.log(message);
// 	console.log(message.body);
// });



