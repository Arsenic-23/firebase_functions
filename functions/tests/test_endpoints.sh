#!/bin/bash

# You need to manually export FIREBASE_ID_TOKEN before running this script
if [ -z "$FIREBASE_ID_TOKEN" ]; then
  echo "Error: FIREBASE_ID_TOKEN environment variable is not set."
  echo "You must attach a valid Firebase Auth token to test onCall endpoints."
  echo "Run: export FIREBASE_ID_TOKEN=\"your.jwt.token\""
  exit 1
fi

echo "Testing getUserBalance..."
curl -X POST https://getuserbalance-x6znpjvd3a-uc.a.run.app \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{}}'
echo -e "\n\n"

echo "Testing createStudioJob..."
curl -X POST https://createstudiojob-x6znpjvd3a-uc.a.run.app \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "provider": "poyo",
      "model": "seedance-2.0",
      "parameters": {
        "prompt": "A beautiful sunset over the mountains"
      }
    }
  }'
echo -e "\n\n"

echo "Testing getJobStatus..."
# Replace JOB_ID with a real job ID after creating one
curl -X POST https://getjobstatus-x6znpjvd3a-uc.a.run.app \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "jobId": "REPLACE_ME"
    }
  }'
echo -e "\n\n"

echo "Testing getUserCreations..."
curl -X POST https://getusercreations-x6znpjvd3a-uc.a.run.app \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "limit": 10
    }
  }'
echo -e "\n\n"

echo "Testing createCheckoutSession..."
curl -X POST https://createcheckoutsession-x6znpjvd3a-uc.a.run.app \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "plan": "starter"
    }
  }'
echo -e "\n\n"
