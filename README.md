# Code Explainer

Code Explainer helps students understand pasted code with a plain-English summary, a line-by-line walkthrough, key concepts, and suggested improvements. It also generates a three-question quiz with answers so you can check what you learned.

## How to use

1. Open `index.html` in your browser (double-click it; no installation or build step needed).
2. Paste a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) into the password field.
3. Paste your code, choose a model and level, and click **Explain**.

## Built with Google Gemma 4

Uses `gemma-4-26b-a4b-it` or `gemma-4-31b-it` through the Gemini API. Everything is in one HTML file: no frameworks, dependencies, or server.

## Privacy

Your key stays in the browser tab's memory; the app never stores it in localStorage or includes it in the repository. Your pasted code is sent to Google when you click **Explain**, and the key is sent only as the API request header. Remove passwords, private keys, and other secrets from code before submitting it. Your browser and Google's services handle the network request according to their own policies.

## Ideas for the future

- Add more languages and tailored language-specific lessons.
- Save quiz results locally, only with the student's consent.
- Add interactive exercises based on the submitted code.

Licensed under the MIT License; see `LICENSE`.
