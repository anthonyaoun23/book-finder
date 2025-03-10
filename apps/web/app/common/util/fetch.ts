import { API_URL } from "../constants/api";
import { getErrorMessage } from "./errors";

export const post = async <T>(path: string, data: FormData | object) => {
  try {
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
    
    return { error: "", data: parsedRes as T };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error occurred" };
  }
};

export const uploadFile = async <T>(path: string, formData: FormData) => {
  try {
    const res = await fetch(`${API_URL}/${path}`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      return { error: getErrorMessage(errorData) };
    }
    
    return { error: "", data: await res.json() as T };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error occurred" };
  }
};

export const get = async <T>(
  path: string,
  tags?: string[],
  params?: URLSearchParams
): Promise<T> => {
  const url = params ? `${API_URL}/${path}?${params}` : `${API_URL}/${path}`;
  
  // Only add next.js cache tags on the server
  const options: RequestInit = tags ? { next: { tags } } : {};
  
  const res = await fetch(url, options);
  
  if (!res.ok) {
    throw new Error(`Failed to fetch from ${path}`);
  }
  
  return res.json();
}; 