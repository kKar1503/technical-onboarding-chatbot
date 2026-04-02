import { createUser } from "../lib/db/users";
import type { User } from "../types";

const SEED_USERS: User[] = [
  {
    id: "user-1",
    name: "Alice Chen",
    role: "engineer",
    defaultMode: "technical",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user-2",
    name: "Bob Smith",
    role: "engineer",
    defaultMode: "technical",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user-3",
    name: "Carol Johnson",
    role: "ba",
    defaultMode: "non-technical",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user-4",
    name: "David Lee",
    role: "engineer",
    defaultMode: "technical",
    createdAt: new Date().toISOString(),
  },
  {
    id: "user-5",
    name: "Eve Martinez",
    role: "ba",
    defaultMode: "non-technical",
    createdAt: new Date().toISOString(),
  },
];

async function main() {
  console.log("Seeding users...");
  for (const user of SEED_USERS) {
    await createUser(user);
    console.log(`  Created user: ${user.name} (${user.role})`);
  }
  console.log("Done!");
}

void main();
