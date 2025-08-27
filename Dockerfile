FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --force --timeout=60000

COPY . .

# Use "npm start" to run the script defined in package.json
CMD ["npm", "start"]
