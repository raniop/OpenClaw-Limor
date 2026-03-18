import { config } from "./config";

let token: string | null = null;

async function login(): Promise<void> {
  const res = await fetch(`${config.crmApiUrl}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: config.crmUsername,
      password: config.crmPassword,
    }),
  });
  if (!res.ok) {
    throw new Error(`CRM login failed: ${res.status}`);
  }
  const data = await res.json() as Record<string, any>;
  token = data.token || data.accessToken || data.Token || data.AccessToken;
  if (!token) {
    const keys = Object.keys(data);
    for (const key of keys) {
      if (typeof data[key] === "string" && (data[key] as string).length > 20) {
        token = data[key] as string;
        break;
      }
    }
  }
  if (!token) {
    throw new Error("CRM login: no token in response");
  }
  console.log("🔑 CRM: logged in successfully");
}

async function apiCall(path: string, options?: RequestInit): Promise<any> {
  if (!token) {
    await login();
  }

  const url = `${config.crmApiUrl}${path}`;
  let res = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  // Auto-refresh on 401
  if (res.status === 401) {
    await login();
    res = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CRM API error ${res.status}: ${text}`);
  }

  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function searchPolicyByPersonId(personId: string): Promise<string> {
  try {
    // GetById returns policies for a person ID
    const data = await apiCall(`/api/Policy/GetById?id=${encodeURIComponent(personId)}`);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return `לא נמצאו פוליסות עבור ת.ז ${personId}`;
    }
    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    return `שגיאה בחיפוש: ${error.message}`;
  }
}

export async function getPolicyDetails(policyIndex: number): Promise<string> {
  try {
    const data = await apiCall(`/api/Policy/GetPolicyDetailsById?policyIndex=${policyIndex}`);
    if (!data) return "לא נמצאו פרטים לפוליסה זו";
    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}

export async function getPolicyCustomers(policyIndex: number): Promise<string> {
  try {
    const data = await apiCall(`/api/Policy/GetPolicyCustomersDetailsByIndex?policyIndex=${policyIndex}`);
    if (!data) return "לא נמצאו פרטי לקוחות";
    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}

export async function getTopPolicies(top: number = 10): Promise<string> {
  try {
    const data = await apiCall(`/api/Policy/GetTopPolicies?top=${top}`);
    if (!data) return "אין פוליסות";
    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}

export async function getDashboard(month?: number, year?: number): Promise<string> {
  try {
    let data;
    if (month && year) {
      data = await apiCall(`/api/Dashboard/GetDashboardCalcByData?month=${month}&year=${year}`);
    } else {
      data = await apiCall("/api/Dashboard");
    }
    if (!data) return "אין נתוני דשבורד";
    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}

export async function getAgentsReport(page: number = 1, pageSize: number = 50): Promise<string> {
  try {
    const data = await apiCall(`/api/Policy/GetAgentsReport?page=${page}&pageSize=${pageSize}`);
    if (!data) return "אין נתוני דוח סוכנים";
    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}

export async function sendSms(mobile: string, message: string): Promise<string> {
  try {
    await apiCall(`/api/Message/sendsmsmessage?mobile=${encodeURIComponent(mobile)}&message=${encodeURIComponent(message)}`);
    return `SMS נשלח בהצלחה ל-${mobile}`;
  } catch (error: any) {
    return `שגיאה בשליחת SMS: ${error.message}`;
  }
}

export async function getBitulRiderPolicies(date: string, riderCode: number): Promise<string> {
  try {
    const data = await apiCall(`/api/Policy/getBitulRiderPolicies?date=${encodeURIComponent(date)}&riderCode=${riderCode}`);
    if (!data) return "אין נתונים";
    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}

export async function getDailyReportRiderList(): Promise<string> {
  try {
    const data = await apiCall("/api/Policy/getDailyReportRiderList");
    if (!data) return "אין נתונים";
    return JSON.stringify(data, null, 2);
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}
