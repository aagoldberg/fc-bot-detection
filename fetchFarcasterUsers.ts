import axios from 'axios';
import fs from 'fs';
import path from 'path';

const API_URL = 'https://api.openrank.io/farcaster/users';
const BATCH_SIZE = 100; // Assuming the API allows fetching in batches of 100
const TOTAL_USERS = 100;
const OUTPUT_FILE_NAME = 'farcaster_users.json';

// Get folder path from command line arguments
const folderPath =  './data/topOpenRankUsers';

interface User {
  id: string;
  username: string;
  rank: number;
  // Add other fields based on the API response
}

const fetchUsers = async (start: number, limit: number): Promise<User[]> => {
  try {
    const response = await axios.get(`${API_URL}?start=${start}&limit=${limit}`);
    return response.data.users;
  } catch (error) {
    console.error(`Error fetching users from ${start} to ${start + limit}:`, error);
    return [];
  }
};

const getAllUsers = async (): Promise<User[]> => {
  const users: User[] = [];
  for (let i = 0; i < TOTAL_USERS; i += BATCH_SIZE) {
    const batch = await fetchUsers(i, BATCH_SIZE);
    users.push(...batch);
  }
  return users;
};

const saveUsersToFile = async (users: User[], folder: string, filename: string) => {
  try {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    const filePath = path.join(folder, filename);
    const jsonData = JSON.stringify(users, null, 2);
    fs.writeFileSync(filePath, jsonData, 'utf-8');
    console.log(`Data successfully saved to ${filePath}`);
  } catch (error) {
    console.error('Error saving data to file:', error);
  }
};

const main = async () => {
  const users = await getAllUsers();
  console.log(`Fetched ${users.length} users`);
  await saveUsersToFile(users, folderPath, OUTPUT_FILE_NAME);
};

main().catch((error) => console.error('Error in main function:', error));
