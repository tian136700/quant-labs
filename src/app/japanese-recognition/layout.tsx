import type { Metadata } from "next";

export default function JapaneseRecognitionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;600&family=Noto+Sans+JP:wght@300;400;500&family=Inter:wght@300;400;500&display=swap"
      />
      {children}
    </>
  );
}

export const metadata: Metadata = {
  other: {
    "google": "notranslate",
  },
};
