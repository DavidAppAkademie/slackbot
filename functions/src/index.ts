import * as functions from "firebase-functions";
const { PubSub } = require('@google-cloud/pubsub');

import axios from "axios";

const pubSubClient = new PubSub();

const backUpId = '623f7a2103704f5da5f0aba6ad8ae65c';

exports.slackUiProvider = functions.region("europe-west3").
    https.onRequest(async (req, res) => {
        //return the UI to show to the user
        res.json({
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "Zu welchen Lehrinhalten ist deine Kritik?"
                    },
                    "accessory": {
                        "type": "radio_buttons",
                        "options": [
                            {
                                "text": {
                                    "type": "plain_text",
                                    "text": "Task Sheet",
                                    "emoji": true
                                },
                                "value": "value-0"
                            },
                            {
                                "text": {
                                    "type": "plain_text",
                                    "text": "Slide Deck",
                                    "emoji": true
                                },
                                "value": "value-1"
                            },
                            {
                                "text": {
                                    "type": "plain_text",
                                    "text": "Cheat Sheet",
                                    "emoji": true
                                },
                                "value": "value-2"
                            }
                        ],
                        "action_id": "radio_buttons-action"
                    }
                },
                {
                    "type": "input",
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "plain_text_input-action"
                    },
                    "label": {
                        "type": "plain_text",
                        "text": "Lektion (X.Y.Z)",
                        "emoji": true
                    }
                },
                {
                    "type": "input",
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "plain_text_input-action"
                    },
                    "label": {
                        "type": "plain_text",
                        "text": "Titel",
                        "emoji": true
                    }
                },
                {
                    "type": "input",
                    "element": {
                        "type": "plain_text_input",
                        "multiline": true,
                        "action_id": "plain_text_input-action"
                    },
                    "label": {
                        "type": "plain_text",
                        "text": "Beschreibung",
                        "emoji": true
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Feedback einsenden!",
                                "emoji": true
                            },
                            "value": "click_me_123",
                            "action_id": "actionId-0"
                        }
                    ]
                }
            ]
        });
    }
    );
exports.slackInteractivityHandler = functions.runWith({ secrets: ["NOTION_BOT_SECRET"] }).region("europe-west3").
    https.onRequest(async (req, res) => {
        const payload = JSON.parse(req.body.payload);
        const selectedRadioButton = payload.state.values['o5gl/']['radio_buttons-action'].selected_option.text.text;
        var title = payload.state.values['VomEW']['plain_text_input-action'].value;
        const lection = payload.state.values['P7WBs']['plain_text_input-action'].value;
        const description = payload.state.values['2ygiu']['plain_text_input-action'].value;
        const userName = payload.user.username;

        // do not create a task if the user did not fill out all fields
        if (lection == null || description == null) {
            res.sendStatus(200);
            return;
        }
        const responseUrl = payload.response_url;

        const headers = {
            "Authorization": `Bearer ${process.env.NOTION_BOT_SECRET}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        };
        // in case the user failed at providing a valid lection, we add the lection they provided to the title
        if (getIdFromChapter(lection) == backUpId) {
            title += ` ${lection}`;
        }

        const ticketBody = {
            "children": [
                {
                    "object": "block",
                    "type": "callout",
                    "callout": {
                        "rich_text": [
                            {
                                "type": "text",
                                "text": {
                                    "content": `${title} (${userName}, ${selectedRadioButton})\n${description}`,
                                    "link": null
                                }
                            }
                        ],
                        "icon": {
                            "type": "emoji",
                            "emoji": "🐛"
                        }
                    }
                },

            ],
        };
        const propertyBody = {
            "properties": {
                "Status": {
                    "status": {
                        "name": "Offenes Feedback"
                    }
                }
            }
        };
        const lectionBody = {
            "lection": lection,
        }

        // run a background task to send the response to slack
        // this will cause the slack ui to close after form submission
        await pubSubClient.topic("slack-response").publishMessage({
            data: Buffer.from(JSON.stringify({ responseUrl })),
        })

        // run a background task to create the task in clickup
        await pubSubClient.topic("notion").publishMessage({
            data: Buffer.from(JSON.stringify({ ticketBody, propertyBody, headers, lectionBody })),
        })

        // return a 200 response to slack
        // this response needs to be sent within 3 seconds
        // otherwise slack will show an error message to the user
        // this is why we run the background tasks above
        res.sendStatus(200);
    }
    );

export const notion = functions.region("europe-west3").pubsub.topic("notion").onPublish(async (message) => {
    const ticketBody = message.json.ticketBody;
    const propertyBody = message.json.propertyBody;
    const lectionBody = message.json.lectionBody;
    const headers = message.json.headers;
    const id = getIdFromChapter(lectionBody.lection);
    await axios.patch(`https://api.notion.com/v1/blocks/${id}/children`, ticketBody, { headers });
    await axios.patch(`https://api.notion.com/v1/pages/${id}`, propertyBody, { headers });

});
export const slackResponse = functions.region("europe-west3").pubsub.topic("slack-response").onPublish(async (message) => {
    await axios.post(message.json.responseUrl, {
        "text": "Danke für dein Feedback!",
    });
});

function getIdFromChapter(chapter: string): string {
    const chapterOneMap = {
        // content : id
        '1.2.1': 'ae6c066e1d8c4c329cc92aa8d7437cca',
        '1.2.2': '2f89c882862c4e92b5272fe4d85b9c61',
        '1.2.3': 'ed2d191c427749eab734ad6d98492ae7',
        '1.2.1 - 1.2.3': '9a118cf57e7b482cade551b8bb19cb62',
        '1.3.1': 'fec18a840b934d458df4d1e56d71b156',
        '1.3.2': '2004235571ef414a8a8c8fd48bee6fd9',
        '1.3.3': '621084bfcda14c2b833585e823ffe63f',
        '1.4.1': '368f80d157514a9bb039713b65b96c94',
        '1.4.2': 'c459786395cd41e088127ac052197c79',
        '1.4.3': '9121cb9a05ed4a778c256cbef4b6dfaf',
        '1.3.1 - 1.4.3': 'd58320d757404a71b643d78c74385294',
        '1.5.1': '975d99146ef3416bb311733f146a9d3c',
        '1.6.1': 'e4b51919a2b74135a567c7def1e7ea08',
        '1.5.1 - 1.6.1': '8de2d9a59f33486d882a065f238b76a7',
        '1.6.2': 'edb10f0cc9bf44138fd4482e1af982b8',
        '1.6.3': 'f686918d2e1c41298549cb9e7f348d3e',
    };

    const chapterTwoMap = {
        // content : id
        '2.1.1': '508d177ac29d4253a293df3863b3c27f',
        '2.1.2': '38e88693292c43b09d60360bfec812d9',
        '2.1.3': 'a4d988ec870f416ba53b67eea18445a5',
        '2.1.4': 'ff7836d79cc749c28e669421c1e0c682',
        '2.1.5': 'de13000c52bf4ab3ab2060ce6c86ff8c',
        '2.2.1': 'bca7a7ce64c141aca4e2657e57661c9d',
        '2.2.2': '599bd84fa08c4cc687e60d79c6b6fcc7',
        '2.2.3': '06e92a1438e54d11ab9d481fd11c5257',
        '2.2.4': 'fb33f312c9dd48c390718d4a5a21c2be',
        '2.2.1 - 2.2.3': 'e1b648621bbc4608860e3d09a21bca0f',
        '2.3.1': 'cb826d21991b4815baaeeca9fc96f2a5',
        '2.3.2': 'bfd2d8aa1e3f4d10a608f5e4d5c60f58',
        '2.3.3': 'ad2deb019ed9455184ea20e88fd42472',
        '2.3.4': '4dd7bb0ff9bb4106a77e36a2256d87f5',
        '2.3.1 - 2.3.4': '0f32a76ee81943d3a14f360eb191738c',
        '2.4.1': 'a51db0f31def4f1fa8321d3939710c53',
        '2.4.2': '3fc2abde287a4116a53fe4ef72e4a46f',
        '2.4.3': '20d557917d6b49e0bb3832999e75a30e',
        '2.4.4': '1f6b7d95559147d997a872dc8fb18329',
        '2.4.1 - 2.4.4': '354a3034b49649289acca08a918fc94a',
        '2.5.1': '39ba2e07a83546949596696cedb075d0',
    };

    const chapterThreeMap = {
        // content : id
        '3.1.1': '470c8f2f485e46169d87f1d7942021c6',
        '3.1.2': '7813eee2fccc46079ec526d4b7844d9a',
        '3.1.3': '5c0383c61ae74340ac92b0e70b149433',
        '3.1.4': '07f17855bd54482bae93f102dfdb3d37',
        '3.1.1 - 3.1.4': '8464c3dad1234877a74ba0988e81716c',
        '3.2.1': '28d05c486c9d4d358c2c5a588ec15c17',
        '3.2.2': 'db355348ca24491683f85607ef277d38',
        '3.3.1': 'ed916fbdf86e4704bd9060c49778d49d',
        '3.3.2': '8a0ea83e4750442ba8f1fcea9826dc72',
        '3.2.1 - 3.3.2': 'c5a6f9e47608481294f7d904164c2b07',
        '3.3.3': 'ad55186573704f938052f51e844c9f77',
        '3.3.4': 'a5a9694429834cc49412ffaf2be956f5',
        '3.3.5': '181e9746cc7745139f63ccf36e88e328',
        '3.3.6': '9cab5637689f40b18214a27b38319689',
        '3.3.4 - 3.3.6': '9cb61517773140439a3a15fec0bf08d7',
        '3.3.7': 'a682669aa7b14bd08ba6f5adb412be9b',
        '3.4.1': '1047439cd701460ab86fab3d2356e3b9',
        '3.4.2': 'c25530dc618d40e49f96b74265d4b6f1',
        '3.4.3': '73641cdea057483eb8365c1485a4426b',
        '3.4.4': '1e40863a609e4227958c7d98912ba9ce',
        '3.3.7 - 3.4.4': '6b8897812139403db932d2a6834e5c2b',
    };

    const chapterFourMap = {
        // content : id
        '4.1.1': 'f16881a17e7d41f584987d2fc08272f7',
        '4.1.2': '60349f045b1e4b23ba54a3ff9ed0f117',
        '4.2.1': '6493ad2d925f4313bf6cd24e49233f48',
        '4.2.2': '5143aa693abb490fb15cbd6c5593b9ef',
        '4.2.3': '335ba0a9517d4271a3bf57454898e531',
        '4.2.4': '1e7e9da50b3e4e3eb8df1369bdbce57a',
        '4.2.1 - 4.2.4': '2a56059e64074b9c89ef5d0ba20f619b',
        '4.3.1': '4f3c88789d9c4a34b7072943cb4a8f1f',
        '4.4.1': '4fa98814309c44baa4d0613b5ee5d50b',
        '4.4.2': 'c42c53ddd5574dd79db1fde22452c9e9',
        '4.4.3': '3a0adfe6d27d480ea979076f60e2f172',
        '4.4.4': '6aed44c7c2414ab8a3337e2cf4062727',
        '4.4.5': '6b3dba37ad5e4e97819f32f44ab9eeab',
        '4.4.6': '9dba55cad5ca4037946fc20df8d1dcbe',
    };

    const chapterFiveMap = {
        // content : id
        '5.1.1': 'c88be2ea15b1481fb93a9154f5c36217',
        '5.1.2': '68bddbb69ea44a6ca0612d98fa183456',
        '5.1.3': 'ac714e20d3e04cd7a6700febf79b73e2',
        '5.2.1': 'd7d9c535d9eb4fb78420485aabb9f2d7',
        '5.2.2': '66a6284dd93e4d6cba9d1341d2e878ae',
        '5.2.3': '6aa817684e3f4389bfd9f78a367190f3',
        '5.2.4': '243593159b834bb9b133f49be3254fea',
        '5.2.1 - 5.2.4': '9f4ba80453f748b9a48e69f03be05f51',
        '5.3.1': 'e0369aad368545a58734b2f6b351653c',
        '5.3.2': '675c3d55b8a34011a55894d2d5de9693',
        '5.3.3': 'cd7bae13bcaf4bfa88e679ca6a597bdd',
        '5.3.1 - 5.3.3': '682656eb926a4802bdef1b8e85ca3513',
        '5.4.1': 'f2042f90a0484cfa9bf3afa4fab66989',
        '5.4.2': 'b37ebe6766524fe5b358517265a4d324',
        '5.4.3': '036151d1b6554f97914ff2a4533ed82c',
        '5.4.1 - 5.4.3': 'b2c6ed193b1c47f9bc2232c2b43415a5',
        '5.5.1': '8dd5699e9a674118a6b393da4c7d7538',
        '5.5.2': '123371a57078421c8e1120455bca4131',
        '5.5.3': '04a9ff967cab48cd8e1a163dd4ad1c25',
        '5.5.1 - 5.5.3': 'fda74e396ee94349a8f71a383b2bb26d',
        '5.6.1': 'f56df41274cd47d0b72a04df1a66131f',
        '5.6.2': '2e78a783399944f8b676a07d001afcbf',
        '5.6.3': '058689aed835423ba01a69cd0381ccc7',
        '5.6.1 - 5.6.3': 'be9546a4c53f496483f4eb2553015cbe',
        '5.7.1': '44df2e0d56d54d8c824bbd7bff28368d',
        '5.7.2': 'b537c3a0061a4873b845bf38d474ef1d',
        '5.7.3': '72b76644ba464520b6a03b9da1c05a13',
        '5.7.1 - 5.7.3': '9b8db7ec05cd470cbac3cc4a3bb674d1',
    };

    const chapterSixMap = {
        // content : id
        '6.1.1': 'fc73caafe538417e92b97bc2f32704f9',
        '6.1.2': 'db8e6fcd172d4f0f9390f045381a0783',
        '6.1.3': '5f28da3f60c34fbca85be432ab714a28',
        '6.1.4': '36004b7e3da6433ba26d33bd5beffc77',
        '6.1.1 - 6.1.4': 'b4953bbf1c564f20bf35100f5efeac56',
        '6.2.1': '7b639c8a7ea74e28aee9ae9222ca4412',
        '6.2.2': '19b42a63cc67460b9e9daed76eae9f24',
        '6.2.3': 'f02acd7bb0fb470083b41b28088b085f',
        '6.2.1  6.2.3': '2c0d47a9e0954a3c988279af4e2e1cb3',
        '6.2.4': 'a58f6e90460c4c2fb2564e2e68819831',
        '6.2.5': '66be4032df964560ad76be1b0968e894',
        '6.2.4 - 6.2.5': '106eff27c9a44cd8af1093fd66b18245',
        '6.3.1': '696cb74bb59245e5a02e39e5f124c79f',
        '6.3.2': 'ab3b2976df714106960f7530a6879b28',
        '6.3.3': 'f1ed6e7b0b9140e2ad978b47d4eb2d41',
        '6.3.1 - 6.3.3': '0abd224048b6485fa0e5b489c978b7ef',
        '6.3.4': '7aaac161ebe24d4b86440d3ee8e3cbd7',
        '6.3.4 - 6.3.4': '2dbdfeb25a684803b0828dd182a5fc14',
        '6.4.1': '1823ad59b3f24ba2816e75f7cae89bda',
        '6.4.2': '992a47e4acdf46c0991482e069cb3584',
        '6.4.3': '6805063ce6c34097bb79c3ab9f778575',
        '6.4.4': 'a11098671cc1498fa745dc9f8fa621de',
    };

    const allChaptersMap: { [key: string]: string } = {
        ...chapterOneMap,
        ...chapterTwoMap,
        ...chapterThreeMap,
        ...chapterFourMap,
        ...chapterFiveMap,
        ...chapterSixMap,
    };
    // if chapter is not in the map, return "emergencyId"
    return allChaptersMap[chapter] || backUpId;
}