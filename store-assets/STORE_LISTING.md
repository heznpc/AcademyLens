# AcademyLens — AI Course Translator (Unofficial)

Read English AI courses in your language without wrecking the technical terms.

AcademyLens helps learners read OpenAI Academy courses with fast page translation and multilingual OpenAI/AI terminology glossaries.

**Unofficial, not affiliated with OpenAI.**

> **Name policy:** the extension name must not contain another company's trademark. Keep the store title as the AcademyLens brand plus a plain descriptor. Name the supported site in the description instead, where it is a factual statement of compatibility. Localized names live in `_locales/<locale>/messages.json`; `npm run check:files` fails if any locale puts `OpenAI Academy` in `extName`.

## Short Description

Translate OpenAI Academy course pages with protected AI terminology. Unofficial, not affiliated with OpenAI.

## Full Description

AcademyLens is an unofficial browser extension for learners using OpenAI Academy.

It translates visible course content, restores original text when needed, and preserves important AI terms so course pages stay easier to read across languages.

Unlike a generic page translator, AcademyLens keeps AI terminology intact and leaves the course platform's own controls alone, so progress, quizzes, and certificates keep working while you read.

Features:

- Translate OpenAI Academy course pages.
- Choose your translation engine: on-device only (the default), on-device with an opt-in Google Translate fallback, Google Translate, or one of six models on your local Ollama server. Network and localhost permissions are requested only when needed.
- Preserve terms such as OpenAI, ChatGPT, GPT, LLM, API, Responses API, Agents SDK, JSON, and Gradual.
- Apply installed premium glossary packs based on OpenAI Academy course language and OpenAI documentation terminology.
- Show whether the selected language has final/native-reviewed, community-reviewed, AI-audited beta, AI-drafted beta, or protected-term machine translation support.
- Restore original page text with one click.
- Protect against stale translations after Restore, language switching, and Gradual/Next.js navigation.
- Avoid translating Gradual progress, certificate, quiz, and account controls.
- Keep translation settings in Chrome storage.

AcademyLens includes thirteen premium glossary packs with 100+ OpenAI Academy/OpenAI Docs core terms each: German, Spanish, French, Hindi, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Russian, Vietnamese, Simplified Chinese, and Traditional Chinese. Korean is the first community-reviewed pack; the other premium packs are AI-audited beta glossaries with a recorded second-pass high-risk terminology audit and automated quality checks. They still need X translation cross-checks, community review, and native review. Other languages use machine translation with protected-term preservation.

The store listing itself is localized for German, English, Spanish, French, Italian, Japanese, Korean, Brazilian Portuguese, Russian, Simplified Chinese, and Traditional Chinese.

AcademyLens does not manage enrollment, progress, certificates, accounts, or OpenAI Academy settings.

This extension is unofficial and not affiliated with OpenAI.

## Privacy Summary

Page text selected for translation follows the engine chosen by the learner. The default browser-native Translator API keeps text on the device. Browser-managed translator downloads stay off unless the user explicitly enables them. Google Translate paths require an optional permission before text is sent to `translate.googleapis.com`. Local Ollama requires a separately running server and optional access to `localhost:11434`; text stays on that computer and is processed by the selected local model. If auto-translate is enabled, newly rendered visible lesson text can be translated automatically after page changes. Original visible text, translated text, language, provider/model/glossary state, and cache timestamps may be stored locally in Chrome extension storage. The extension does not run an AcademyLens server, does not load remote AI scripts in v1, and does not collect personal data for the developer.

## Planned Later

AI-assisted terminology review may be added later only if it can be implemented without remote hosted code risk and with explicit opt-in privacy disclosure.

## Store Asset Status

This file is listing copy only. Final Chrome Web Store screenshots and promotional images are not committed yet. Screenshot drafts generated under `dist/store-screenshots/` are local review artifacts and must be manually checked before public use.
