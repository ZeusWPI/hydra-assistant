// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const PORT = process.env.PORT || 3000;

// Server stuff
const express = require('express');
const fetch = require('node-fetch');

// Stuff for the fulfillment
const {WebhookClient, Text} = require('dialogflow-fulfillment');
const {Table} = require('actions-on-google');

// Map the different resto's to their endpoints.
const RESTO_ENDPOINT_MAP = {
    "De Brug": "nl-debrug",
    "Sint-Jansvest": "nl-sintjansvest",
    "Coupure": "nl",
    "Dunant": "nl",
    "Heymans": "nl-heymans",
    "Merelbeke": "nl",
    "Sterre": "nl",
    "Kantienberg": "nl-kantienberg"
};

// TODO:
// 1. Save the preferred resto (possible once the client library supports it)
// 2. Add things like: 'Find the closest resto'.

/**
 * Handles showing the menu.
 * For now, this just mentions the main menu.
 * TODO: soup?
 * TODO: multilang?
 *
 * @param {WebhookClient} agent
 */
function show_menu(agent) {

    const restoParam = agent.parameters['resto'];
    const dateParam = agent.parameters['date'];

    console.log(`Resto is: ${restoParam}`);

    if (!RESTO_ENDPOINT_MAP.hasOwnProperty(restoParam)) {
        resto_not_recognized(agent, restoParam);
        return;
    }

    let date;
    if (!dateParam) {
        date = new Date();
    } else {
        date = new Date(dateParam);
    }

    console.log(`Date is ${date}`);

    const url = constructUrl(RESTO_ENDPOINT_MAP[restoParam], date);

    return fetch(url).then(function (response) {
        if (response.ok) {
            return response.json();
        } else {
            console.log("No menu was found.");
            agent.add('Er is geen menu gevonden.');
        }
    }).then(function(json) {
        respondWithJson(json, date, agent);
    }).catch(reason => {
        console.warn(reason);
        agent.add(`Er is geen menu gevonden voor ${restoParam}.`);
    });
}

/**
 * Handle an unknown resto.
 * @param {WebhookClient} agent
 * @param {string} resto
 */
function resto_not_recognized(agent, resto) {
    agent.add(`De resto ${resto} ken ik niet. Probeer het opnieuw met een andere resto.`);
}

/**
 * Respond with the json of a menu.
 * @param json The menu.
 * @param {Date} date
 * @param {WebhookClient} agent
 */
function respondWithJson(json, date, agent) {

    if (json.open && json.meals !== null && json.meals !== undefined) {
        let nonSoups = json.meals
            .filter(m => m.kind !== 'soup')
            .map(m => m.name);
        let soups = json.meals
            .filter(m => m.kind === 'soup')
            .map(m => m.name)
            .map(soup => soup.replace(' klein', '').replace(' groot', ''));
        soups = [...new Set(soups)];

        let names = [...soups, ...nonSoups];

        let nameString = new Intl.ListFormat('nl').format(names);

        const assistant = agent.conv();
        const hasScreen = assistant && assistant.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

        if (!hasScreen) {
            agent.add(`Op het menu staat ${nameString}.`);
            return;
        }

        const otherRows = soups
            .map(s => [s, '']);
        const mealRows = json.meals
            .filter((m => m.kind !== 'soup'))
            .map(m => [m.name, m.price]);
        const table = new Table({
             dividers: true,
             columns: ['Item', 'Prijs'],
             rows: otherRows.concat(mealRows),
         });

        const text = `<speak>Hier is het menu van <say-as interpret-as="date" format="dm">${date.getDate()}-${date.getMonth()+1}</say-as>:</speak>`;
        assistant.close(text, table);
        agent.add(assistant);
    } else {
        console.log(json);
        if (json.message) {
            agent.add(`De resto is gesloten met dit bericht: ${json.message}`);
        } else {
            agent.add('De resto is gesloten.');
        }
    }
}

function constructUrl(endpoint, date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `https://hydra.ugent.be/api/2.0/resto/menu/${endpoint}/${year}/${month}/${day}.json`;
}

function handleRestoNotRecognized(conv, resto) {
    conv.close(`De resto ${resto} ken ik niet. Probeer het opnieuw.`);
}

// Set the DialogflowApp object to handle the HTTPS POST request.
const app = express().use(express.json());
/**
 * We listen to all requests, and pass it to the dialog app.
 */
app.post('/assistant', function(request, response) {

    // The agent.
    const agent = new WebhookClient({request, response});

    const intentMap = new Map();
    intentMap.set('show-menu', show_menu);

    agent.handleRequest(intentMap);
});

app.listen(PORT);
