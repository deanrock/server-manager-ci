# server-manager-ci

CI project for server manager (https://github.com/deanrock/server-manager).
Uses Gitlab webhooks to execute commands inside docker containers on instances of server-manager/

## Setup

  - Clone the project
  - Run `npm install`
  - Run `cp example-config.js config.js` and fill out the blanks
    - url: Full web URL to your server-manager (where the apps you would like to restart/manage live)
    - username: Username on your server-manager
    - password: Password for user
    - ssh_host: Hostname used for SSH'ing to your server-manager
    - ssh_port: Port used for SSH'ing to your server-manager
    - slack_webhook: Slack webhook URL
    - myurl: Domain name where server-manager-ci is running
    - private_key_path: Path to private key inside server-manager-ci container
    - private_key_passphrase: Passphrase to key
  - Run gitlab hook server with `node index`

## For developers

  - Download https://ngrok.com/
  - Run `ngrok http 7777`
  - Copy the url found under 'Forwarding' section into `module.exports.myurl`
  - Go to Gitlab under 'hooks' section and add `http://your-ngrok-url/webhook` as a webhook
  - Click test and you should be seeing some output in your gitlab hook server running locally (A push event for branch master is sent)
  - NOTE: the token you set for your

## Issues

  - Config should have a list of allowed gitlab hosts (otherwise anyone could simulate a matching token with their own gitlab)
