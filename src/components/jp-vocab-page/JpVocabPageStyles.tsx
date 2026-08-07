"use client";

import { JpVocabPitchAccentStyles } from "@/components/JpVocabPitchAccentStyles";
import { JpVocabPageStylesLayout } from "./JpVocabPageStylesLayout";
import { JpVocabPageStylesTable } from "./JpVocabPageStylesTable";

export function JpVocabPageStyles() {
  return (
    <>
      <JpVocabPitchAccentStyles />
      <JpVocabPageStylesLayout />
      <JpVocabPageStylesTable />
    </>
  );
}
