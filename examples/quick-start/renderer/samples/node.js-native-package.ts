import { SerialPort } from 'serialport'
import sqlite3 from 'sqlite3'

function openDatabase(filename: string) {
  return new Promise<sqlite3.Database>((resolve, reject) => {
    const database = new sqlite3.Database(filename, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve(database)
    })
  })
}

function runStatement(database: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    database.run(sql, params, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function queryRows<T>(database: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    database.all<T>(sql, params, (error, rows) => {
      if (error) {
        reject(error)
        return
      }

      resolve(rows)
    })
  })
}

function closeDatabase(database: sqlite3.Database) {
  return new Promise<void>((resolve, reject) => {
    database.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

async function logAvailableSerialPorts() {
  const ports = await SerialPort.list()

  console.log('Node.js native package serialport available ports:\n', ports)
}

async function runSqliteDemo() {
  const database = await openDatabase(':memory:')

  try {
    await runStatement(
      database,
      `CREATE TABLE devices (
				id INTEGER PRIMARY KEY,
				driver TEXT NOT NULL,
				status TEXT NOT NULL
			)`,
    )
    await runStatement(database, 'INSERT INTO devices (driver, status) VALUES (?, ?), (?, ?)', [
      'serialport',
      'ready',
      'sqlite3',
      'ready',
    ])

    const rows = await queryRows<{ id: number; driver: string; status: string }>(
      database,
      'SELECT id, driver, status FROM devices ORDER BY id',
    )

    console.log('Node.js native package sqlite3 in-memory rows:\n', rows)
  } finally {
    await closeDatabase(database)
  }
}

async function bootstrapNativePackages() {
  console.log('Node.js native package serialport constructor:\n', SerialPort)
  console.log('Node.js native package sqlite3 module:\n', sqlite3)

  await Promise.all([logAvailableSerialPorts(), runSqliteDemo()])
}

void bootstrapNativePackages().catch((error: unknown) => {
  console.error('Native package sample failed:', error)
})
