import axios, { AxiosResponse } from 'axios';

export async function fetchData(
    baseURL: string,
    endpoint: string,
    params: any[],
    dataFormatter: (data: any) => any
): Promise<any> {
    try {
        const url = `${baseURL}${endpoint}`;
        const formattedURL = params.reduce((acc, param, index) => acc.replace(`%d`, param).replace(`%s`, param), url);
        const response: AxiosResponse = await axios.get(formattedURL);
        return dataFormatter(response.data);
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}
