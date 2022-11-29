const express = require("express");
const path = require("path");

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeServerAndDb = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server initialized at http://3000");
    });
  } catch (e) {
    console.log(`Dberror:${e.message}`);
    process.exit(1);
  }
};

initializeServerAndDb();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
//User Login                 API1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
    select * from User
    where username='${username}';`;
  //console.log(selectUserQuery);
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
            insert into User(username,password,name,gender)
            values(
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}');
                `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//User Authentication..............API2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    select * from User
    where username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET");
      response.send(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time  API3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const loggedInUser = `
        select user_id from user
        where username='${username}'`;

  const latestTweetsQuery = `
        select username,tweet,date_time AS dateTime
        from follower
        inner join tweet
        on follower.following_user_id=tweet.user_id
        inner join user
        on tweet.user_id=user.user_id 
        where follower.follower_user_id = (${loggedInUser})
        order by date_time desc 
        limit 4 ;`;
  //console.log(latestTweetsQuery);
  const latestTweets = await db.all(latestTweetsQuery);
  //console.log(latestTweets);
  response.send(latestTweets);
});

//Returns the list of all names of people whom the user follows  API4
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const loggedInUser = `
        select user_id from user
        where username='${username}'`;

  const namesOfPeopleUserFollowsQuery = `
        select name from follower
        inner join user
        on user_id=following_user_id
        where follower.follower_user_id=(${loggedInUser});`;
  const namesOfPeople = await db.all(namesOfPeopleUserFollowsQuery);
  response.send(namesOfPeople);
});

//Returns the list of all names of people who follows the user  API5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const loggedInUser = `
        select user_id from user
        where username='${username}'`;
  //console.log(loggedInUser);
  const peopleFollowsUserQuery = `
        select name
        from follower
        inner join user
        on user_id=follower_user_id
        where following_user_id = (${loggedInUser});`;
  //console.log(peopleFollowsUserQuery);
  const peopleFollowsUser = await db.all(peopleFollowsUserQuery);

  response.send(peopleFollowsUser);
});

//If the user requests a tweet of the user he is following,
//return the tweet, likes count, replies count and date-time  API6
app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;
  const loggedInUser = `
        select user_id from user
        where username='${username}'`;

  const tweetsQuery = `
  select * from tweet
  where tweet_id=${tweetId};`;
  const tweetResult = await db.get(tweetsQuery);

  const userFollowersQuery = `
        select * from follower
        inner join user
        on user_id=following_user_id
        where follower.follower_user_id=(${loggedInUser});`;
  const userFollowers = await db.all(userFollowersQuery);

  //console.log(tweetId);
  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    const tweetQuery = `
        select tweet from tweet
        inner join like 
        on tweet.tweet_id=like.tweet_id
        inner join reply on
        tweet.tweet_id=reply.tweet_id 
        ;`;
    const tweet = await db.get(tweetQuery);
    response.send(tweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//If the user requests a tweet of a user he is following,
//return the list of usernames who liked the tweet  API7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;

    const loggedInUser = `
        select user_id from user
        where username='${username}'`;

    const tweetsQuery = `
        select * from tweet
        where tweet_id=${tweetId};`;
    const tweetResult = await db.get(tweetsQuery);

    const userFollowersQuery = `
        select * from follower
        inner join user
        on user_id=following_user_id
        where follower.follower_user_id=(${loggedInUser});`;
    const userFollowers = await db.all(userFollowersQuery);

    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const userNamesWhoLikesTweetQuery = `
    select name as likes from user
    where user_id in
    (select user_id from like
        where tweet_id=${tweetId});`;
      const userNames = await db.all(userNamesWhoLikesTweetQuery);
      response.send(userNames);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//If the user requests a tweet of a user he is following,
//return the list of replies.   API8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;

    const loggedInUser = `
        select user_id from user
        where username='${username}'`;

    const tweetsQuery = `
        select * from tweet
        where tweet_id=${tweetId};`;
    const tweetResult = await db.get(tweetsQuery);

    const userFollowersQuery = `
        select * from follower
        inner join user
        on user_id=following_user_id
        where follower.follower_user_id=(${loggedInUser});`;
    const userFollowers = await db.all(userFollowersQuery);

    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const userNamesWhoRepliesTweetQuery = `
    select name,reply  as replies from user
    inner join reply
    on user.user_id=reply.user_id
    where user.user_id in
    (select user_id from reply
        where tweet_id=${tweetId});`;
      const userNames = await db.all(userNamesWhoRepliesTweetQuery);
      response.send(userNames);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Returns a list of all tweets of the user   API9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const loggedInUser = `
        select user_id from user
        where username='${username}'`;
  //console.log(loggedInUser);
  const tweetsOfUserQuery = `
  select tweet,
  count(like_id) AS likes,
  count(reply_id) AS replies,
  tweet.date_time
  from tweet inner join reply
  on tweet.tweet_id=reply.tweet_id
  inner join like
  on tweet.tweet_id=like.tweet_id
  group by tweet.user_id
  having tweet.user_id=(${loggedInUser});`;
  const tweetsOfUser = await db.all(tweetsOfUserQuery);
  response.send(tweetsOfUser);
});

//Create a tweet in the tweet table  API10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  let now = new Date();
  const loggedInUser = `
        select user_id from user
        where username='${username}'`;
  const newTweetQuery = `
    insert into
    tweet (tweet,user_id,date_time)
    values
    ('${tweet}',
    (${loggedInUser}),
    '${now}')`;
  await db.run(newTweetQuery);
  response.send("Created a Tweet");
});

//If the user requests to delete a tweet of other users   API11
app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const loggedInUserQuery = `
        select user_id from user
        where username='${username}'`;
  const loggedInUser = await db.get(loggedInUserQuery);
  //console.log(loggedInUser);
  const tweetQuery = `
    select * from tweet where 
    tweet_id=${tweetId}`;
  const tweetUser = await db.get(tweetQuery);
  //console.log(tweetUser);

  if (loggedInUser.user_id === tweetUser.user_id) {
    const deleteTweetQuery = `
    delete from tweet
    where tweet_id=${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
