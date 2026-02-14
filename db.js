const Database = require('better-sqlite3');
const db = new Database('reminders.db');


// Schema
db.exec(`
    -- "Our Reminders" group - store once after first lookup
    CREATE TABLE IF NOT EXISTS group_config (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        group_id    TEXT    NOT NULL,
        group_name  TEXT,
        updated_at  TEXT    DEFAULT (datetime('now'))
    );

    -- Task templates (loaded from tasks.json, then synced here)
    CREATE TABLE IF NOT EXISTS tasks (
        id               TEXT PRIMARY KEY,
        title            TEXT NOT NULL,
        description      TEXT,
        assignee         TEXT NOT NULL,
        recurrence       TEXT NOT NULL,   -- JSON: {"type":"monthly","dayOfMonth":5} | {"type":"daily"} | {"type":"weekly","dayOfWeek":1} | {"type":"yearly","month":3,"day":15}
        timezone         TEXT NOT NULL DEFAULT 'Asia/Colombo',
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now'))
    );


    -- One row per (task_id, due_date). Created when that task is due on that date;
    -- message_id and status are set/updated when the WhatsApp message is sent/completed.
        CREATE TABLE IF NOT EXISTS reminders (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id      TEXT NOT NULL,
            due_date     TEXT NOT NULL,
            message_id   TEXT,                        -- NULL until message is sent
            status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'completed'
            sent_at      TEXT,
            completed_at TEXT,
            created_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(task_id, due_date),
            FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_due_date ON reminders(due_date);
    CREATE INDEX IF NOT EXISTS idx_reminders_message_id ON reminders(message_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_task_due ON reminders(task_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(due_date, status) WHERE status = 'pending';
`);


// Store group config
const storeGroupConfig = (group_id, group_name) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO group_config (group_id, group_name) VALUES (?, ?)');
    stmt.run(group_id, group_name);
};

// Get group config
const getGroupId = () => {
    const stmt = db.prepare('SELECT group_id FROM group_config WHERE id = 1');
    return stmt.get().group_id;
};

// Create bulk tasks
const createTasks = (tasks) => {
    const stmt = db.prepare('INSERT INTO tasks (id, title, description, assignee, recurrence, timezone) VALUES (?, ?, ?, ?, ?, ?)');
    tasks.forEach(task => {
        stmt.run(task.id, task.title, task.description, task.assignee, task.recurrence, task.timezone);
    });
};

// Get all tasks
const getAllTasks = () => {
    const stmt = db.prepare('SELECT * FROM tasks');
    return stmt.all();
};

// Create a reminder
const createReminder = (task_id, due_date) => {
    const stmt = db.prepare('INSERT INTO reminders (task_id, due_date) VALUES (?, ?)');
    stmt.run(task_id, due_date);
};

// createReminderIfNotExists (on conflict do nothing)
const createReminderIfNotExists = (task_id, due_date) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO reminders (task_id, due_date) VALUES (?, ?) ON CONFLICT DO NOTHING');
    stmt.run(task_id, due_date);
};

// Get reminders for a given date
const getRemindersForDate = (date) => {
    const stmt = db.prepare('SELECT * FROM reminders WHERE due_date = ?');
    return stmt.all(date);
};

// Update reminder as sent
const updateReminderAsSent = (message_id, reminder_id) => {
    const stmt = db.prepare('UPDATE reminders SET message_id = ?, status = "sent", sent_at = datetime("now") WHERE id = ?');
    stmt.run(message_id, reminder_id);
};

// Update reminder as completed
const updateReminderAsCompleted = (reminder_id) => {
    const stmt = db.prepare('UPDATE reminders SET status = "completed", completed_at = datetime("now") WHERE task_id = ? AND due_date = ?');
    stmt.run(task_id, due_date);
};
