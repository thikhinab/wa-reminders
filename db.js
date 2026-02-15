import Database from 'better-sqlite3';
import { logger } from './logger.js';
const db = new Database('reminders.db');

// Schema
db.exec(`
    -- "Our Reminders" group - store once after first lookup
    CREATE TABLE IF NOT EXISTS group_config (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        chat_id     TEXT    NOT NULL,
        group_name  TEXT,
        updated_at  TEXT   NOT NULL
    );

    -- Task templates (loaded from tasks.json, then synced here)
    CREATE TABLE IF NOT EXISTS tasks (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        title            TEXT NOT NULL UNIQUE,
        description      TEXT,
        recurrence       TEXT NOT NULL,   -- JSON: {"type":"monthly","dayOfMonth":5} | {"type":"daily"} | {"type":"weekly","dayOfWeek": 1} | {"type":"yearly","month":3,"day":15}
        timezone         TEXT NOT NULL DEFAULT 'Asia/Colombo',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
    );


    -- One row per (task_id, due_date). Created when that task is due on that date;
    -- message_id and status are set/updated when the WhatsApp message is sent/completed.
        CREATE TABLE IF NOT EXISTS reminders (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id      TEXT NOT NULL,
            due_date     TEXT NOT NULL,
            message_id   TEXT,                        -- NULL until message is sent
            status       TEXT NOT NULL DEFAULT 'upcoming',  -- 'upcoming' | 'sent' | 'completed'
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            UNIQUE(task_id, due_date),
            FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_due_date ON reminders(due_date);
    CREATE INDEX IF NOT EXISTS idx_reminders_message_id ON reminders(message_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_task_due ON reminders(task_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_reminders_upcoming ON reminders(due_date, status) WHERE status = 'upcoming';
`);



export function getCurrentDateTimeString() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}


function calculateDueDate(recurrence) {
    switch (recurrence.type) {
        case 'daily':
            // today's date
            return getCurrentDateTimeString()
        case 'weekly':
            // It could be either today or next week Moday, Tuesday, etc.
            const nextDay = new Date();
            nextDay.setDate(nextDay.getDate() + (recurrence.dayOfWeek - nextDay.getDay()) % 7);
            return today.getTime() > nextDay.getTime() ? nextDay.toISOString().replace(/\.\d{3}Z$/, '+00:00') : today.toISOString().replace(/\.\d{3}Z$/, '+00:00');
        case 'monthly': {
            // Next occurrence: today if same day, else this month if day not yet passed, else next month
            const today = new Date();
            const dayToday = today.getDate();
            if (dayToday === recurrence.dayOfMonth) {
                return getCurrentDateTimeString();
            }
            const next = new Date(today.getFullYear(), today.getMonth(), recurrence.dayOfMonth);
            if (recurrence.dayOfMonth > dayToday) {
                // This month, day still ahead (e.g. today 15, dayOfMonth 18 → Feb 18)
                return next.toISOString().replace(/\.\d{3}Z$/, '+00:00');
            }
            // Day already passed this month → next month
            next.setMonth(next.getMonth() + 1);
            return next.toISOString().replace(/\.\d{3}Z$/, '+00:00');
        }
        case 'yearly':
            // Check if the current date is the date of the year
            const date = new Date();
            if (date.getDate() === recurrence.day && date.getMonth() === recurrence.month) {
                return getCurrentDateTimeString();
            } else {
                const nextYear = new Date();
                nextYear.setFullYear(nextYear.getFullYear() + 1);
                nextYear.setDate(recurrence.day);
                nextYear.setMonth(recurrence.month);
                return nextYear.toISOString().replace(/\.\d{3}Z$/, '+00:00');
            }
        default:
            throw new Error(`Invalid recurrence type: ${recurrence.type}`);
    }
}

export const getChatId = () => {
    const stmt = db.prepare('SELECT chat_id FROM group_config');
    const chatId = stmt.get()?.chat_id ?? null;
    logger.info(`Chat id is ${chatId}`);
    return chatId;
};

export const saveChatId = (chatId, groupName) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO group_config (chat_id, group_name, updated_at) VALUES (?, ?, ?)');
    stmt.run(chatId, groupName, getCurrentDateTimeString());
    logger.info(`Saved chat id ${chatId} for group ${groupName}`);
};

export const createTasks = (tasks) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO tasks (title, description, recurrence, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    tasks.forEach(task => {
        stmt.run(task.title, task.description ?? '', JSON.stringify(task.recurrence), task.timezone ?? 'Asia/Colombo', getCurrentDateTimeString(), getCurrentDateTimeString());    });

    logger.info(`Created ${tasks.length} tasks`);
};

export const getTasks = () => {
    const stmt = db.prepare('SELECT * FROM tasks');
    const tasks = stmt.all();
    // Convert the recurrence to an object
    tasks.forEach(task => {
        task.recurrence = JSON.parse(task.recurrence);
    });
    logger.info(`Tasks are ${JSON.stringify(tasks)}`);
    return tasks;
};

export const getTaskById = (id) => {
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(id);
    logger.info(`Task ${id} is ${JSON.stringify(task)}`);
    return task;
};

export const getReminderByTaskId = (taskId) => {
    const stmt = db.prepare('SELECT * FROM reminders WHERE task_id = ?');
    const reminder = stmt.get(taskId);
    logger.info(`Reminder for task ${taskId} is ${JSON.stringify(reminder)}`);
    return reminder;
};

export const createReminderFromTask = (task) => {

    // Calculate the due date for the task
    const dueDate = calculateDueDate(task.recurrence);
    logger.info(`Due date for task ${task.id} with recurrence ${JSON.stringify(task.recurrence)} is ${dueDate}`);
    // Create the reminder
    const stmt = db.prepare('INSERT OR IGNORE INTO reminders (task_id, due_date, created_at, updated_at) VALUES (?, ?, ?, ?)');
    stmt.run(task.id, dueDate, getCurrentDateTimeString(), getCurrentDateTimeString());
    logger.info(`Created reminder for task ${task.id} on ${dueDate}`);
};

export const getUpcomingRemindersDueToday = () => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const start_date = start.toISOString().replace('Z', '+00:00');
    const end_date = end.toISOString().replace('Z', '+00:00');
    const stmt = db.prepare('SELECT * FROM reminders WHERE due_date >= ? AND due_date < ? AND status = \'upcoming\'');
    const reminders = stmt.all(start_date, end_date);
    logger.info(`Upcoming reminders due today are ${JSON.stringify(reminders)}`);
    return reminders;
};

export const getSentReminders = (sentBefore) => {
    const stmt = db.prepare('SELECT * FROM reminders WHERE updated_at < ? AND status = \'sent\'');
    const reminders = stmt.all(sentBefore)
    logger.info(`Sent reminders are ${JSON.stringify(reminders)}`);
    return reminders;
};

export const updateReminder = (id, messageId, status) => {
    const stmt = db.prepare('UPDATE reminders SET message_id = ?, status = ?, updated_at = ? WHERE id = ?');
    stmt.run(messageId, status, getCurrentDateTimeString(), id);
    logger.info(`Updated reminder ${id} with message id ${messageId} and status ${status}`);
};

export const printTasks = () => {
    const stmt = db.prepare('SELECT * FROM tasks');
    const tasks = stmt.all();
    console.log(tasks);
};