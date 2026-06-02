const url = process.env.SLACK_INCOMING_WEBHOOK || "";

const slackBody = {
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🚨 *Token Limit Warning: Syed's AI Assistant Action Required* 🚨"
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: "*Visitor Identity Name:*\nAdmin Tester"
        },
        {
          type: "mrkdwn",
          text: "*Contact Email:*\ntester@example.com"
        },
        {
          type: "mrkdwn",
          text: "*Target Session Key:*\n`4421e2d2-e4fa-40f6-8080-a15252809f47`"
        }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "✅ Approve Session"
          },
          style: "primary",
          action_id: "approve_session",
          value: "4421e2d2-e4fa-40f6-8080-a15252809f47"
        }
      ]
    }
  ]
};

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(slackBody)
})
.then(async (res) => {
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text);
})
.catch((err) => {
  console.error("Fetch Error:", err);
});
