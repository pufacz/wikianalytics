import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { WikiContrib, WikiUser } from '../types';

interface StoredDataset {
    id: string; // username@lang
    username: string;
    lang: string;
    lastUpdated: string; // ISO Date of save
    timestamp: number;   // Timestamp for sorting
    rangeStart: string;
    rangeEnd: string;
    user: WikiUser;
    contributions: WikiContrib[];
}

interface WikiAnalyticsDB extends DBSchema {
    datasets: {
        key: string;
        value: StoredDataset;
        indexes: { 'timestamp': number };
    };
}

const DB_NAME = 'wiki-analytics-v1';

export class WikiStorage {
    private dbPromise: Promise<IDBPDatabase<WikiAnalyticsDB>>;

    constructor() {
        this.dbPromise = openDB<WikiAnalyticsDB>(DB_NAME, 1, {
            upgrade(db) {
                const store = db.createObjectStore('datasets', { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp');
            },
        });
    }

    async save(username: string, lang: string, user: WikiUser, contibs: WikiContrib[], rangeStart: string, rangeEnd: string) {
        const db = await this.dbPromise;
        const id = `${username}@${lang}`;
        const now = new Date();

        const dataset: StoredDataset = {
            id,
            username,
            lang,
            lastUpdated: now.toISOString(),
            timestamp: now.getTime(),
            rangeStart,
            rangeEnd,
            user,
            contributions: contibs
        };

        await db.put('datasets', dataset);
    }

    async load(username: string, lang: string): Promise<StoredDataset | undefined> {
        const db = await this.dbPromise;
        const id = `${username}@${lang}`;
        return db.get('datasets', id);
    }

    async listUsers(): Promise<Omit<StoredDataset, 'contributions' | 'user'>[]> {
        const db = await this.dbPromise;
        const datasets = await db.getAllFromIndex('datasets', 'timestamp');
        // Return newest first
        return datasets.reverse().map(({ contributions, user, ...meta }) => meta);
    }

    async delete(username: string, lang: string) {
        const db = await this.dbPromise;
        const id = `${username}@${lang}`;
        await db.delete('datasets', id);
    }
}

export const storage = new WikiStorage();
