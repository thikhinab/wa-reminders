import Database from 'better-sqlite3';
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
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        title            TEXT NOT NULL UNIQUE,
        description      TEXT,
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


export const createTasks = (tasks) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO tasks (title, description, recurrence, timezone) VALUES (?, ?, ?, ?)');
    tasks.forEach(task => {
        stmt.run(task.title, task.description ?? '', JSON.stringify(task.recurrence), task.timezone ?? 'Asia/Colombo');    });
};

export const printTasks = () => {
    const stmt = db.prepare('SELECT * FROM tasks');
    const tasks = stmt.all();
    console.log(tasks);
};