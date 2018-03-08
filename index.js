const Twitter = require('twitter');
const Levenshtein = require('fast-levenshtein');
const fs = require('fs');

const twitter = new Twitter(JSON.parse(fs.readFileSync(process.argv[2]).toString('utf8')));


const MIN_REGULAR_CHARS_PERCENTAGE = 0.7;
const MIN_FOLLOWERS = 3;
const MIN_STATUSES = 3;
const SCREEN_NAME_LEVENSHTEIN_MAX = 3;
const SCREEN_NAME = 'krakenfx';


// alternate approach: build a score, based on string similarity, profile image similarity, tweet content search
const ACCOUNT_NAME = 'Kraken Exchange';
const ACCOUNT_IMAGE = 'https://pbs.twimg.com/profile_images/781247043800997888/1R1pdAKq_400x400.jpg';
var accountImageBuffer = null;

var request = require('request').defaults({ encoding: null });

request.get(ACCOUNT_IMAGE, function (err, res, body) {
	accountImageBuffer = new Buffer(body);
});


const stringSimilarity = require('string-similarity');
const Rembrandt = require('rembrandt/build/node');
const MIN_SCAM_SCORE = 15;
const SCORE_WEIGHT_NAME = 40;
const SCORE_WEIGHT_IMAGE = 40;
const SCORE_WEIGHT_KEYWORDS = 20;


process.on('unhandledRejection', (err) => {
    console.error('%j: %j', err, err.stack);
});

(async() => {

    let shouldBlock = await findSpammersMentioning(SCREEN_NAME);

    const blockOutput = shouldBlock.map(reply => {
        return `${reply.user.screen_name} ${reply.scamScore.scoreTotal}: ${reply.user.id} - ${reply.text}`;
    });

    console.log(`Scores above ${MIN_SCAM_SCORE}:`, blockOutput.length);
    console.log('%s', JSON.stringify(blockOutput, null, 4));

})();

async function findSpammersMentioning(mention) {

    console.log('Searching mentions for %s', mention);
    const replies = await twitter.get('search/tweets', {q: `to:${mention}`, count: 100});
	const replyStatuses = replies.statuses;
	
	let i, max;
	let reply = {};
	for( i=0, max=replyStatuses.length; i<max; i++ ){
		reply = replyStatuses[i];
		
		// check the name
		
		// compare the account names
		let scoreName = stringSimilarity.compareTwoStrings(ACCOUNT_NAME, reply.user.name); 
		
		
		// check the profile image
		let scoreImage = 0;

		var request = require('request').defaults({ encoding: null });
		var userImageBuffer = null;
		request.get(reply.user.profile_image_url, function (err, res, body) {
			//process exif here
			userImageBuffer = new Buffer(body);

			let rembrandt = new Rembrandt({
				// `imageA` and `imageB` can be either Strings (file path on node.js,
				// public url on Browsers) or Buffers
				imageA: accountImageBuffer,
				imageB: userImageBuffer,

				// Needs to be one of Rembrandt.THRESHOLD_PERCENT or Rembrandt.THRESHOLD_PIXELS
				thresholdType: Rembrandt.THRESHOLD_PERCENT,

				// The maximum threshold (0...1 for THRESHOLD_PERCENT, pixel count for THRESHOLD_PIXELS
				maxThreshold: 0.01,

				// Maximum color delta (0...255):
				maxDelta: 20,

				// Maximum surrounding pixel offset
				maxOffset: 0,

				renderComposition: false, // Should Rembrandt render a composition image?
				compositionMaskColor: Rembrandt.Color.RED // Color of unmatched pixels
			})
		
			rembrandt.compare()
				.then(function(result){
					scoreImage = result.percentageDifference; // high is more scammy
					//console.log('Passed:', result.passed)
					//console.log('Pixel Difference:', result.differences, 'Percentage Difference', result.percentageDifference, '%')
					//console.log('Composition image buffer:', result.compositionImage)
				})
				.catch((e) => {
					console.error(e)
				});
		});

		// check for particular keywords
		// lower score should be expected, because a post for ethereum wouldn't mention bitcoin, for example
		const keywords = [
			'ETH',
			'giving away',
			'BTC',
			'ethereum',
			'fans',
			'bitcoin'
		];

		let keywordsCount = 0;
		let j, maj;
		for( j=0, maj=keywords.length; j<maj; j++ ){
			if( reply.text.indexOf(keywords[j])>-1 ){
				keywordsCount++;
			}
		}
		scoreKeywords = keywordsCount / keywords.length;
		
		
		reply.scamScore = {
			scoreName: scoreName, 
			scoreImage: scoreImage,
			scoreKeywords: scoreKeywords,
			scoreTotal: (
				(scoreName*SCORE_WEIGHT_NAME) + 
				(scoreImage*SCORE_WEIGHT_IMAGE) + 
				(scoreKeywords*SCORE_WEIGHT_KEYWORDS)
			).toFixed(2)
		};
		
	}	
 

	replyStatuses.sort(function(a,b){
		return b.scamScore.scoreTotal - a.scamScore.scoreTotal;
	})

	let results = replyStatuses.filter(reply => {
		if( reply.scamScore.scoreTotal>MIN_SCAM_SCORE ){
			return true;
		}
		
		return false;
	});
	return results;



	// ORIGINAL CODE
	/*

    let results = replies.statuses.filter(reply => {

        //check username levenshtein distance
        if (Levenshtein.get(reply.user.screen_name, SCREEN_NAME) <= SCREEN_NAME_LEVENSHTEIN_MAX) {
            return true;
        }

        if (reply.user.screen_name.toLowerCase().indexOf('kraken') >= 0) {
            return true;
        }

        if (reply.text.match(/[а-яА-ЯЁё]/)) {
            return true;
        }

        if (reply.user.followers_count <= MIN_FOLLOWERS && reply.user.statuses_count <= MIN_STATUSES) {
            return true;
        }
        
        
        return true;

    });
	
    return results;
	*/
}