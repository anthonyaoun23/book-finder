import { API_URL } from "../constants/api";
import { getErrorMessage } from "./errors";

export const post = async (path: string, data: FormData | object) => {
    const body = data instanceof FormData ? Object.fromEntries(data) : data;
    const res = await fetch(`${API_URL}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsedRes = await res.json();
    if (!res.ok) {
      return { error: getErrorMessage(parsedRes) };
    }
    return { error: "", data: parsedRes };
  };

export const uploadFile = async (path: string, formData: FormData) => {
  try {
    const res = await fetch(`${API_URL}/${path}`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      return { error: getErrorMessage(errorData) };
    }
    
    return { error: "", data: await res.json() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error occurred" };
  }
};

export const get = async <T>(
  path: string,
  tags?: string[],
  params?: URLSearchParams
) => {
  try {
    const url = params ? `${API_URL}/${path}?${params}` : `${API_URL}/${path}`;
    const res = await fetch(url, {
      next: { tags },
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch from ${path}`);
    }
    
    return res.json() as Promise<T>;
  } catch (error) {
    console.error(`Error fetching from ${path}:`, error);
    throw error;
  }
}; 