import { fetchData } from "./common/axios";
import * as fs from 'fs';

interface Reply {
    author: {
        fid: number;
    };
    // Add other properties if needed
}

interface Cast {
    parentAuthor?: {
        fid: number;
    };
    parentHash: string;
    threadHash: string;
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

export async function checkCastsAndHiddenRepliesForMultipleFids(fids: number[], scs: number = 0, openrank: number = 0) {
    const results = [];

    for (const fid of fids) {
        console.log(`Processing FID: ${fid}`);
        const result = await checkCastsAndHiddenReplies(fid, scs, openrank);
        results.push({ fid, result });
        console.log(`Result for FID ${fid}:`, result);
    }

    // Write results to a JSON file
    fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
    console.log('Results have been written to results.json');
}

export async function checkCastsAndHiddenReplies(userFid: number, scs: number = 0, openrank: number = 0): Promise<any> {
    return new Promise(async (resolve, reject) => {
        const timeout = 4000;

        if (!userFid) {
            clearTimeout(timeout);
            resolve({});
            return false;
        }

        let castsCursor: string | undefined = undefined;
        const processedParentFids: Set<number> = new Set();
        let castVisibleWhenNotFollowing = 0;

        await (async function processCasts() {
            try {
                do {
                    const { casts, nextCursor: nextCastsCursor }: FetchCastsResult = await getCasts(userFid, 30, castsCursor);

                    if (!casts) {
                        console.error('Failed to fetch casts, terminating process.');
                        break;
                    }

                    castsCursor = nextCastsCursor;

                    for (const cast of casts) {
                        const parentFid = cast.parentAuthor?.fid;
                        const parentHash = cast.parentHash;
                        const threadHash = cast.threadHash;

                        if (parentFid && parentHash && parentHash === threadHash && parentFid !== userFid) {
                            if (processedParentFids.has(parentFid)) {
                                continue;
                            }

                            processedParentFids.add(parentFid);

                            const followedBy = await isFollowing(parentFid, userFid);

                            if (!followedBy) {
                                let hasMoreReplies = true;

                                while (hasMoreReplies) {
                                    const hiddenReplies: Reply[] = await getHiddenReplies(parentHash, 100);

                                    if (!hiddenReplies) {
                                        console.error('Failed to fetch hidden replies, terminating process.');
                                        break;
                                    }

                                    const foundHiddenReply = hiddenReplies.some((reply: Reply) => reply.author.fid === userFid);

                                    if (foundHiddenReply) {
                                        console.log(`Found a hidden reply from fid=${userFid}`);
                                        resolve({ cast });
                                        return { cast };
                                    }

                                    hasMoreReplies = hiddenReplies.length === 100;
                                }

                                console.log(`No hidden reply found from fid=${userFid}`);
                                castVisibleWhenNotFollowing++;
                                if (castVisibleWhenNotFollowing > 1) {
                                    resolve({});
                                    return false;
                                }
                            }
                        }
                    }
                } while (castsCursor);

                console.log(`No hidden reply found from fid=${userFid}`);
                resolve({});
            } catch (error) {
                resolve({});
                reject(error);
            }

            return false;
        })();
    });
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

async function isFollowing(parentFid: number, userFid: number): Promise<boolean> {
    try {
        const result = await fetchData(
            'https://www.supercast.xyz',
            `/api/profile?fid=${parentFid}&viewerFid=${userFid}`,
            [],
            (data: FetchDataResponse<{ user: { followedBy: boolean } }>) => data?.result?.user
        );
        return result?.followedBy || false;
    } catch (error) {
        console.error('Error checking follow status:', error);
        return false;
    }
}

async function getHiddenReplies(focusedCastHash: string, limit: number, cursor?: string): Promise<Reply[]> {
    try {
        const result = await fetchData(
            'https://client.warpcast.com',
            cursor ? `/v1/user-thread-hidden-replies?focusedCastHash=${focusedCastHash}&limit=${limit}&cursor=${cursor}` : `/v1/user-thread-hidden-replies?focusedCastHash=${focusedCastHash}&limit=${limit}`,
            [],
            (data: FetchDataResponse<{ casts: Reply[] }>) => (data?.result?.casts || [])
        );

        return result;
    } catch (error) {
        console.error('Error fetching hidden replies:', error);
        return [];
    }
}

checkCastsAndHiddenRepliesForMultipleFids([230238, 422233, 1, 389066, 398688]).then(() => {
    console.log('Processing completed for all FIDs.');
}).catch((error) => {
    console.error('Error processing FIDs:', error);
});
