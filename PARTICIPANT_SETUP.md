# Participant Setup Guide

This challenge uses Strava as the source of truth. Your Garmin or Apple Watch runs count after they appear in Strava as running activities.

## A. Install and Set Up Strava

1. Create or log in to a Strava account.
2. Install the Strava app on your phone.
3. Make sure your runs are uploaded to Strava.
4. Set your activity visibility so the challenge organiser's Strava app can read your runs.
5. Private activities may not be counted unless you authorize the required Strava permission.

Only runs inside the challenge period, 4 May 2026 to 31 December 2026, are counted.

## B. Garmin Users

1. Open Garmin Connect.
2. Go to connected apps or account settings.
3. Connect Garmin Connect to Strava.
4. Confirm that future Garmin activities automatically sync to Strava.
5. Do a short test run or upload an existing activity to confirm sync.
6. Open Strava and make sure the activity appears as a run.

## C. Apple Watch Users

1. Open the Strava app.
2. Connect Apple Health to Strava.
3. Allow Strava to read workout data.
4. Ensure runs recorded on Apple Watch are imported or synced into Strava.
5. Do a short test run or import an existing run to confirm sync.
6. Open Strava and make sure the activity appears as a run.

## D. Authorising the Challenge App

Each participant needs to authorize the organiser's Strava app once.

Flow:

1. Open the challenge website: [https://breadlover97.github.io/running-challenge/](https://breadlover97.github.io/running-challenge/)
2. Tap **Join with Strava**.
3. Log in to Strava.
4. Approve access.
5. Strava redirects you back to the challenge website.
6. Tap **Copy Code**.
7. Send the code privately to the organiser with your display name and activity source.

Activity source options:

- `Garmin → Strava`
- `Apple Watch → Strava`
- `Strava App`

Organiser flow:

1. Open [Add Strava Participant](https://github.com/breadlover97/running-challenge/actions/workflows/add_participant.yml).
2. Click **Run workflow**.
3. Enter the participant's display name, source label, and one-time code.
4. Click **Run workflow**.
5. Run [Daily Mileage Challenge Update](https://github.com/breadlover97/running-challenge/actions/workflows/daily_update.yml).

Do not post authorization codes or tokens in the group chat.

## E. Consent and Privacy

By joining the challenge, you agree that:

- Your total mileage will be displayed on the challenge website.
- Your daily mileage may be posted to the Telegram group.
- Your Strava activity links may be shown for validation.
- GPS maps, exact start/end locations, coordinates, heart rate, cadence, and power will not be displayed.
- Only running activities within the challenge period will count.
- Manual activities are excluded by default.
- You can leave the challenge by asking the organiser to remove your token and data.

## F. Troubleshooting

My Garmin run is not showing on Strava:

- Check that Garmin Connect is linked to Strava.
- Open Garmin Connect and confirm the activity uploaded successfully.
- Wait a few minutes and refresh Strava.
- Confirm the activity type is run.

My Apple Watch run is not showing on Strava:

- Open Strava and check Apple Health permissions.
- Confirm Strava can read workout data.
- Try importing the workout from Strava's Apple Health import screen.
- Confirm the activity type is run.

My Strava activity is private:

- Private activities may not be returned to the challenge app unless you granted `activity:read_all`.
- Ask the organiser to confirm whether your authorization included the required scope.
- Changing visibility later may require waiting for the next daily sync.

My run is recorded as walk, hike, or workout:

- Edit the activity in Strava and change the sport type to run if appropriate.
- It will count after the next sync if it is inside the challenge dates.

My mileage is wrong:

- Open your Strava activity and compare the distance shown there.
- The challenge uses Strava distance, not Garmin Connect or Apple Fitness distance.
- Ask the organiser to check whether the run was excluded as manual, non-run, private, or outside the date range.

My run was manually entered and excluded:

- Manual entries are excluded by default for fairness.
- Ask the organiser if your challenge group allows exceptions.

I changed my Strava privacy settings:

- The update may not appear until the next scheduled sync.
- If it still does not appear, re-authorize the challenge app.

I revoked app access by accident:

- Ask the organiser for a new authorization link.
- Approve access again.
- The organiser will update your refresh token securely.
