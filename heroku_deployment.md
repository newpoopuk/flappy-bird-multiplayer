# Deploying to Heroku

This guide walks you through the steps to deploy your Flappy Bird Multiplayer game to Heroku.

## Prerequisites

1. Create a [Heroku account](https://signup.heroku.com/) if you don't have one
2. Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
3. Make sure your project is in a Git repository

## Steps to Deploy

1. Login to Heroku CLI
   ```bash
   heroku login
   ```

2. Create a new Heroku app
   ```bash
   heroku create flappy-bird-mp
   ```
   This will create a new app with a random name or you can specify your own name (if available).

3. Add a Procfile
   Create a file named `Procfile` (no extension) in the root of your project with the following content:
   ```
   web: node src/server.js
   ```

4. Set up environment variables (if needed)
   ```bash
   heroku config:set NODE_ENV=production
   ```

5. Push your code to Heroku
   ```bash
   git add .
   git commit -m "Ready for Heroku deployment"
   git push heroku main
   ```
   If your main branch is named "master" instead of "main", use `git push heroku master`

6. Open your app
   ```bash
   heroku open
   ```
   This will open your app in the browser, or you can visit `https://your-app-name.herokuapp.com`

## Viewing Logs

To troubleshoot any issues, you can view the logs:
```bash
heroku logs --tail
```

## Scaling

By default, Heroku provides one web dyno. To ensure your app stays awake, you might want to upgrade to a hobby or professional plan.

```bash
heroku ps:scale web=1
```

## Custom Domain (Optional)

To use your own domain name:

1. Purchase a domain name from a provider like Namecheap, GoDaddy, etc.
2. Add the domain to your Heroku app:
   ```bash
   heroku domains:add www.yourdomain.com
   ```
3. Follow Heroku's instructions to update your DNS settings with your domain provider.

## Updating Your App

To update your app after making changes:

```bash
git add .
git commit -m "Update app with new features"
git push heroku main
```

## Automatic Deployment from GitHub (Optional)

You can also set up automatic deployment from GitHub:

1. Go to your Heroku dashboard
2. Select your app
3. Go to the "Deploy" tab
4. Connect to GitHub
5. Select your repository
6. Enable automatic deploys from your main branch 