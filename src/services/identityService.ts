import { getDb } from "../db";
import { Contact, IdentifyRequest, IdentifyResponse } from "../types";

function findByEmailOrPhone(
  email: string | null,
  phoneNumber: string | null
): Contact[] {
  const db = getDb();

  if (email && phoneNumber) {
    return db
      .prepare(
        `SELECT * FROM Contact
         WHERE deletedAt IS NULL
           AND (email = ? OR phoneNumber = ?)
         ORDER BY createdAt ASC`
      )
      .all(email, phoneNumber) as Contact[];
  }

  if (email) {
    return db
      .prepare(
        `SELECT * FROM Contact
         WHERE deletedAt IS NULL AND email = ?
         ORDER BY createdAt ASC`
      )
      .all(email) as Contact[];
  }

  return db
    .prepare(
      `SELECT * FROM Contact
       WHERE deletedAt IS NULL AND phoneNumber = ?
       ORDER BY createdAt ASC`
    )
    .all(phoneNumber) as Contact[];
}

function findCluster(primaryId: number): Contact[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM Contact
       WHERE deletedAt IS NULL
         AND (id = ? OR linkedId = ?)
       ORDER BY createdAt ASC`
    )
    .all(primaryId, primaryId) as Contact[];
}

function createContact(
  email: string | null,
  phoneNumber: string | null,
  linkedId: number | null,
  linkPrecedence: "primary" | "secondary"
): Contact {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(email, phoneNumber, linkedId, linkPrecedence, now, now);

  return db
    .prepare(`SELECT * FROM Contact WHERE id = ?`)
    .get(result.lastInsertRowid) as Contact;
}

function getRootPrimaryId(contact: Contact): number {
  const db = getDb();
  let current = contact;
  const visited = new Set<number>();

  while (current.linkPrecedence === "secondary" && current.linkedId !== null) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    current = db
      .prepare(`SELECT * FROM Contact WHERE id = ?`)
      .get(current.linkedId) as Contact;
  }

  return current.id;
}

export function identifyContact(req: IdentifyRequest): IdentifyResponse {
  const email = req.email ?? null;
  const phoneNumber = req.phoneNumber ? String(req.phoneNumber) : null;

  if (!email && !phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided.");
  }

  const matched = findByEmailOrPhone(email, phoneNumber);

  if (matched.length === 0) {
    const newContact = createContact(email, phoneNumber, null, "primary");
    return buildResponse(newContact.id);
  }

  const rootIds = new Set(matched.map(getRootPrimaryId));

  if (rootIds.size === 1) {
    const primaryId = [...rootIds][0];
    const cluster = findCluster(primaryId);

    const hasNewEmail =
      email !== null && !cluster.some((c) => c.email === email);
    const hasNewPhone =
      phoneNumber !== null &&
      !cluster.some((c) => c.phoneNumber === phoneNumber);

    if (hasNewEmail || hasNewPhone) {
      createContact(email, phoneNumber, primaryId, "secondary");
    }

    return buildResponse(primaryId);
  }

  const db = getDb();
  const primaries = [...rootIds].map(
    (id) =>
      db.prepare(`SELECT * FROM Contact WHERE id = ?`).get(id) as Contact
  );
  primaries.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return buildResponse(primaries[0].id);
}

function buildResponse(primaryId: number): IdentifyResponse {
  const cluster = findCluster(primaryId);
  const primary = cluster.find((c) => c.id === primaryId)!;
  const secondaries = cluster.filter((c) => c.id !== primaryId);

  const emails: string[] = [];
  const phones: string[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  if (primary.email && !seenEmails.has(primary.email)) {
    seenEmails.add(primary.email);
    emails.push(primary.email);
  }
  if (primary.phoneNumber && !seenPhones.has(primary.phoneNumber)) {
    seenPhones.add(primary.phoneNumber);
    phones.push(primary.phoneNumber);
  }

  for (const s of secondaries) {
    if (s.email && !seenEmails.has(s.email)) {
      seenEmails.add(s.email);
      emails.push(s.email);
    }
    if (s.phoneNumber && !seenPhones.has(s.phoneNumber)) {
      seenPhones.add(s.phoneNumber);
      phones.push(s.phoneNumber);
    }
  }

  return {
    contact: {
      primaryContatctId: primaryId,
      emails,
      phoneNumbers: phones,
      secondaryContactIds: secondaries.map((s) => s.id),
    },
  };
}