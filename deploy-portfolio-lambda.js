"use strict";

const
    AWS = require("aws-sdk"),
    s3 = new AWS.S3({apiVersion: "2006-03-01"}),
    sns = new AWS.SNS({apiVersion: "2010-03-31", region: "us-east-1"}),
    unzip = require("unzip-stream"),
    stream = require("stream"),
    guessType = require("guess-content-type"),
    successSnsParams = {
        Message: "Successfully deployed portfolio", /* required */
        Subject: "Successfully Deployed Portfolio",
        TopicArn: "arn:aws:sns:us-east-1:882562276863:deployPortfolioTopic"
    },
    failureSnsParams = {
        Message: "Failed to deploy portfolio", /* required */
        Subject: "Failed to Deploy Portfolio",
        TopicArn: "arn:aws:sns:us-east-1:882562276863:deployPortfolioTopic"
    };

function rejectIfFileIsEmpty() {
    return function (data) {
        if (data.ContentLength === 0) {
            throw "File size is empty";
        }
        return data;
    }
}

function deployPortfolio(sourceBucket = "serverlessbuild.portfolio.collegeboard.org",
                         sourceKey = "serverlessportfoliobuild.zip") {

    return new Promise((resolve, reject) => {
        console.log(`Start Deployment sourceBucket: ${sourceBucket} and key: ${sourceKey}`);
        let
            sourceBucketParams = {
                Bucket: sourceBucket,
                Key: sourceKey
            };
        s3.headObject(sourceBucketParams)
            .promise()
            .then(rejectIfFileIsEmpty())
            .then(() => {
                console.log("Attempting to get object: " + JSON.stringify(sourceBucketParams));
                return new Promise((resolve, reject) => {
                    s3.getObject(sourceBucketParams).createReadStream()
                        .pipe(unzip.Parse())
                        .on("entry", (entry) => {
                            let fileName = entry.path;

                            if (fileName !== "package.json" || fileName === "deploy-portfolio-lambda.js") {
                                console.log("Entering entry: " + fileName);

                                entry.pipe(uploadFromStream(s3, fileName))
                                    .on("finish", () => {
                                        console.log("Uploaded: " + fileName);
                                        console.log("Exiting entry: " + fileName);
                                        entry.autodrain();
                                    })
                                    .on("error", e => {
                                        console.log(e);
                                        reject();
                                    })
                            }
                        })
                        .on("finish", () => {
                            console.log("finish");
                            resolve();
                        })
                        .on("close", () => {
                            console.log("close");
                            resolve();
                        })
                        .on("error", (err) => {
                            console.log(err);
                            reject();
                        });
                });
            })
            .then(() => {
                console.log("End Deploy");
                sns.publish(successSnsParams).promise()
                    .then(console.log("Successfully sent message"))
                    .catch((err) => console.log(err));
                resolve();
            })
            .catch((err) => {
                console.log(err);
                sns.publish(failureSnsParams).promise()
                    .then(console.log("Successfully sent failure message"))
                    .catch((err) => console.log(err.message));
                reject();
            })
    });
}

function uploadFromStream(s3, fileName) {
    let
        targetBucketParams = {
            Bucket: "serverless.portfolio.collegeboard.org"
        },
        pass = new stream.PassThrough(),
        newTargetBucketParams = Object.assign({}, targetBucketParams, {
            Key: fileName,
            Body: pass,
            ACL: "public-read",
            ContentType: guessType(fileName)
        });
    s3.upload(newTargetBucketParams)
        .promise()
        .then(() => {
            console.log("Successfully put and setACL for: " + fileName);
        });
    return pass;
}

module.exports = {
    deployPortfolio
};