import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: Request) {
  let body: { text?: string };
  try {
    body = (await request.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: "無效請求" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "文本為空" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "翻譯功能尚未配置（需設置 ANTHROPIC_API_KEY）" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system:
          "你是一个日语翻译助手。将用户发送的日语文本翻译成简体中文，只输出翻译结果，不加任何解释或标点说明。",
        messages: [{ role: "user", content: text }],
      }),
    });

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      error?: { message?: string };
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || "翻譯服務錯誤" },
        { status: 502 }
      );
    }

    const translation = data.content?.[0]?.text?.trim();
    if (!translation) {
      return NextResponse.json({ error: "翻譯失敗" }, { status: 502 });
    }

    return NextResponse.json({ translation });
  } catch {
    return NextResponse.json({ error: "翻譯出錯，請稍後重試" }, { status: 502 });
  }
}
