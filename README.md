# server-manager-ci

CI project for server manager (https://github.com/deanrock/server-manager)

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

For local testing use: https://ngrok.com/
