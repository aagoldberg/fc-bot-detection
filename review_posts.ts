import { fetchData } from "./common/axios";
import * as fs from 'fs';
import * as path from 'path';

interface Reply {
    author: {
        fid: number;
        username: string;
        displayName: string;
    };
    text: string;
    timestamp: number;
    // Add other properties if needed
}

interface Cast {
    hash: string;
    parentAuthor?: {
        fid: number;
    };
    parentHash?: string;
    threadHash?: string;
    text: string;
    timestamp: number;
    // Add other properties if needed
}

interface FetchCastsResult {
    casts: Cast[];
    nextCursor?: string;
}

interface FetchDataResponse<T> {
    result?: T;
    next?: {
        cursor?: string;
    };
}

interface HiddenReplyInfo {
    cast: Cast;
    hiddenReplies: Reply[];
}

interface UserHiddenReplyCount {
    fid: number;
    username: string;
    displayName: string;
    count: number;
}

const MAX_CASTS_PER_FID = 50;
const MAX_ITERATIONS_WITH_SAME_CURSOR = 10;

export async function reviewHiddenRepliesForFids(fids: number[], outputDirHistory: string, outputDirCounts: string) {
    for (const fid of fids) {
        const hiddenRepliesData: HiddenReplyInfo[] = [];
        const userHiddenReplyCount: { [key: string]: UserHiddenReplyCount } = {};
        let totalHiddenReplies = 0;

        console.log(`Processing FID: ${fid}`);
        const casts = await getCastsForFid(fid);
        let hiddenReplyCount = 0;

        for (let i = 0; i < casts.length; i++) {
            const cast = casts[i];
            const hiddenReplies = await checkHiddenReplies(cast);
            if (hiddenReplies.length > 0) {
                hiddenRepliesData.push({ cast, hiddenReplies });
                hiddenReplies.forEach(reply => {
                    const authorFid = reply.author.fid;
                    const key = `${authorFid}:${reply.author.username}`;
                    if (!userHiddenReplyCount[key]) {
                        userHiddenReplyCount[key] = {
                            fid: reply.author.fid,
                            username: reply.author.username,
                            displayName: reply.author.displayName,
                            count: 0
                        };
                    }
                    userHiddenReplyCount[key].count += 1;
                });
                hiddenReplyCount += hiddenReplies.length;
                totalHiddenReplies += hiddenReplies.length;
            }

            if ((i + 1) % 10 === 0 || i === casts.length - 1) {
                console.log(`Processed ${i + 1} casts for FID: ${fid}. Hidden replies found so far: ${hiddenReplyCount}`);
            }
        }

        console.log(`Finished processing FID: ${fid}. Hidden replies found: ${hiddenReplyCount}`);

        // Write results to JSON files
        const historyFilePath = path.join(outputDirHistory, `hiddenReplies_${fid}.json`);
        const countsFilePath = path.join(outputDirCounts, `hiddenReplyUsers_${fid}.json`);

        fs.writeFileSync(historyFilePath, JSON.stringify(hiddenRepliesData, null, 2));
        fs.writeFileSync(countsFilePath, JSON.stringify(Object.values(userHiddenReplyCount), null, 2));
        console.log(`Hidden replies information for FID ${fid} has been written to ${historyFilePath}`);
        console.log(`User hidden reply counts for FID ${fid} have been written to ${countsFilePath}`);
    }
}

async function getCastsForFid(fid: number, limit: number = 50): Promise<Cast[]> {
    let allCasts: Cast[] = [];
    let castsCursor: string | undefined = undefined;
    let castCount = 0;
    const seenCursors = new Set<string | undefined>();
    let sameCursorIterations = 0;

    try {
        do {
            if (seenCursors.has(castsCursor)) {
                sameCursorIterations++;
                if (sameCursorIterations >= MAX_ITERATIONS_WITH_SAME_CURSOR) {
                    console.warn(`Cursor hasn't changed for ${MAX_ITERATIONS_WITH_SAME_CURSOR} iterations. Breaking the loop to avoid infinite fetch.`);
                    break;
                }
            } else {
                sameCursorIterations = 0;
            }
            seenCursors.add(castsCursor);

            const { casts, nextCursor }: FetchCastsResult = await getCasts(fid, limit, castsCursor);
            allCasts = allCasts.concat(casts);
            castsCursor = nextCursor;
            castCount += casts.length;
            console.log(`Fetched ${casts.length} casts for FID: ${fid}. Total casts fetched: ${castCount}, Next cursor: ${castsCursor}`);

            if (castCount >= MAX_CASTS_PER_FID) {
                console.log(`Reached maximum limit of ${MAX_CASTS_PER_FID} casts for FID: ${fid}.`);
                break;
            }
        } while (castsCursor);
    } catch (error) {
        console.error(`Error fetching casts for fid=${fid}:`, error);
    }

    return allCasts;
}

async function checkHiddenReplies(cast: Cast): Promise<Reply[]> {
    let hiddenReplies: Reply[] = [];
    let cursor: string | undefined = undefined;

    try {
        do {
            const replies: Reply[] = await getHiddenReplies(cast.hash, 100, cursor);
            hiddenReplies = hiddenReplies.concat(replies);
            cursor = replies.length === 100 ? replies[replies.length - 1].timestamp.toString() : undefined;
            console.log(`Checked hidden replies for castHash=${cast.hash}. Hidden replies found: ${hiddenReplies.length}, Next cursor: ${cursor}`);
        } while (cursor);
    } catch (error) {
        console.error(`Error fetching hidden replies for castHash=${cast.hash}:`, error);
    }

    return hiddenReplies;
}

async function getCasts(fid: number, limit: number, cursor?: string): Promise<FetchCastsResult> {
    try {
        const result = await fetchData(
            'https://client.warpcast.com',
            cursor ? `/v2/casts?fid=${fid}&limit=${limit}&cursor=${cursor}` : `/v2/casts?fid=${fid}&limit=${limit}`,
            [],
            (data: FetchDataResponse<{ casts: Cast[] }>) => ({ casts: data?.result?.casts || [], nextCursor: data?.next?.cursor })
        );
        return result;
    } catch (error) {
        console.error('Error fetching casts:', error);
        return { casts: [], nextCursor: undefined };
    }
}

async function getHiddenReplies(castHash: string, limit: number, cursor?: string): Promise<Reply[]> {
    try {
        const result = await fetchData(
            'https://client.warpcast.com',
            cursor ? `/v1/user-thread-hidden-replies?focusedCastHash=${castHash}&limit=${limit}&cursor=${cursor}` : `/v1/user-thread-hidden-replies?focusedCastHash=${castHash}&limit=${limit}`,
            [],
            (data: FetchDataResponse<{ casts: Reply[] }>) => (data?.result?.casts || [])
        );

        return result;
    } catch (error) {
        console.error('Error fetching hidden replies:', error);
        return [];
    }
}

// Sample FIDs to process
const sampleFids = [11599];
const outputDirHistory = './data/history';
const outputDirCounts = './data/counts';

// Ensure the output directories exist
if (!fs.existsSync(outputDirHistory)) {
    fs.mkdirSync(outputDirHistory, { recursive: true });
}
if (!fs.existsSync(outputDirCounts)) {
    fs.mkdirSync(outputDirCounts, { recursive: true });
}

// Run the script
reviewHiddenRepliesForFids(sampleFids, outputDirHistory, outputDirCounts).then(() => {
    console.log('Processing completed for all FIDs.');
}).catch((error) => {
    console.error('Error processing FIDs:', error);
});
