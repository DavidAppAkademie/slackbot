# Slack-to-Notion Feedback Interface using Firebase Functions

This Firebase cloud function service integrates Slack and Notion, allowing users to provide feedback through a Slack UI interface and subsequently creating a task in Notion. Here's a breakdown of its functionality and how to use it.

## Features

1. **slackUiProvider** - Serves a Slack block UI which allows users to:
   - Choose between "Task Sheet" and "Slide Deck" for feedback.
   - Input a lesson number in the format "X.Y.Z".
   - Describe their feedback.
   - Submit the feedback.

2. **slackInteractivityHandler** - Processes the submitted feedback from Slack:
   - Validates the feedback input.
   - Creates a task in Notion with the feedback.
   - Responds to the user in Slack.

3. **notion** - Sends a POST request to Notion API to create a task.

4. **slackResponse** - Sends a POST request to Slack to provide feedback to the user.

## Setup

1. **Dependencies**
   - firebase-functions
   - @google-cloud/pubsub
   - axios

2. **Environment Variables**
   - Ensure that `NOTION_BOT_SECRET` is set in your environment. This is used for authorization when making requests to Notion.

3. **Firebase Functions Regions**
   - All functions in this code are specifically deployed to the `europe-west3` region. If you wish to use a different region, update it in the code.

## Usage

1. Deploy the functions to Firebase using the Firebase CLI.
2. Integrate with your Slack app to serve the UI when necessary.
3. Ensure you've set up the required topics in Google Cloud Pub/Sub (`slack-response` and `notion`).
4. When a user in Slack triggers the UI, they'll see the option to provide feedback.
5. Upon submission, the feedback will be processed, validated, and then sent to Notion as a task.
6. Users will receive a response in Slack thanking them for their feedback.
