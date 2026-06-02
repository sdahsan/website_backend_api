const url = process.env.SLACK_INCOMING_WEBHOOK || "";

const slackBody = {
  text: "Test notification from local scratch test script."
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
