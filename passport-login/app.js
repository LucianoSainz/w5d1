/* eslint-disable no-console */
// web server
const express = require("express");
// express instantiation
const app = express();
// session management. we need this so we can hold the user id
const session = require("express-session");
// cipher algorithm with on-purpose delay
const bcrypt = require("bcrypt");
// Bcrypt to encrypt passwords - defines the bcrypt complexity and time taken to be calculated
const bcryptSalt = 10;
// authentication middleware
const passport = require("passport");
// passport authentication strategy (this case with username and password)
const LocalStrategy = require("passport-local").Strategy;
// middleware which validates you are logged in - otherwise it redirects you
const ensureLogin = require("connect-ensure-login");
// holds temporary information which is self-destroyed after being used. One-off in the session
const flash = require("connect-flash");
// it is our favourite ODM - gives you functionality on top of mongodb
const mongoose = require("mongoose");
// this is needed in order to be able to pass information from html5 forms towards the views
const bodyParser = require("body-parser");
// path management
const path = require("path");
// handlebars templating
const hbs = require("hbs");
// handlebars utilities
const Swag = require("swag");
// here you boot up swag so it is available in the views (made with handlebars)
Swag.registerHelpers(hbs);

const User = require("./models/user");

mongoose.Promise = Promise;
mongoose
  .connect("mongodb://localhost/basic-auth")
  .then(() => {
    console.log("Connected to Mongo!");
  })
  .catch((err) => {
    console.error("Error connecting to mongo", err);
  });

app.use(
  session({
    secret: "our-passport-local-strategy-app",
    resave: true,
    saveUninitialized: true
  })
);

app.use(flash());

app.use(express.static(path.join(__dirname, "/public")));
app.set("views", __dirname + "/views");
app.set("view engine", "hbs");
hbs.registerPartials(__dirname + "/views/partials");

app.use(
  bodyParser.urlencoded({
    extended: true
  })
);

passport.use(
  new LocalStrategy(
    {
      passReqToCallback: true
    },
    (req, username, password, next) => {
      User.findOne(
        {
          username
        },
        (err, user) => {
          if (err) {
            return next(err);
          }

          if (!user) {
            return next(null, false, {
              message: "Incorrect username"
            });
          }
          if (!bcrypt.compareSync(password, user.password)) {
            return next(null, false, {
              message: "Incorrect password"
            });
          }

          return next(null, user);
        }
      );
    }
  )
);

// as per https://stackoverflow.com/a/27637668/1175555
// This gets called when we log in
// The user id (you provide as the second argument of the done function) is saved in the session
// and is later used to retrieve the whole object via the deserializeUser function.
// serializeUser determines which data of the user object should be stored in the session.
// The result of the serializeUser method is attached to the session as req.session.passport.user = {}.
// Here for instance, it would be (as we provide the user id as the key) req.session.passport.user = {id: 'xyz'}
passport.serializeUser((user, cb) => {
  console.log("serialize");
  console.log(`storing ${user._id} in the session`);
  cb(null, user._id);
});

/*
The first argument of deserializeUser corresponds to the key of the user object that was given to the done function. So your whole object is retrieved with help of that key. That key here is the user id (key can be any key of the user object i.e. name,email etc). In deserializeUser that key is matched with the in memory array / database or any data resource.
The fetched object is attached to the request object as req.user

passport.serializeUser(function(user, done) {
    done(null, user.id);
});              │
                 │ 
                 │
                 └─────────────────┬──→ saved to session
                                   │    req.session.passport.user = {id: '..'}
                                   │
                                   ↓           
passport.deserializeUser(function(id, done) {
                   ┌───────────────┘
                   │
                   ↓ 
    User.findById(id, function(err, user) {
        done(err, user);
    });            └──────────────→ user object attaches to the request as req.user   
});
*/
passport.deserializeUser((id, cb) => {
  console.log("deserialize");
  console.log(`Attaching ${id} to req.user`);
  // eslint-disable-next-line consistent-return
  User.findById(id, (err, user) => {
    if (err) {
      return cb(err);
    }
    console.log(user);
    cb(null, user);
  });
});

app.use(passport.initialize());
app.use(passport.session());

app.get("/", ensureLogin.ensureLoggedIn(), (req, res) => {
  res.render("base", {
    user: req.user,
    section: "index"
  });
});

app.get("/signup", (req, res) => {
  res.render("base", {
    section: "signup"
  });
});

app.post("/signup", (req, res, next) => {
  const { username, password } = req.body;

  if (username === "" || password === "") {
    res.render("base", {
      message: "Indicate username and password",
      section: "signup"
    });
    return;
  }

  User.findOne({
    username
  })
    .then((user) => {
      if (user !== null) {
        res.render("base", {
          message: "The username already exists",
          section: "signup"
        });
        return;
      }

      const salt = bcrypt.genSaltSync(bcryptSalt);
      const hashPass = bcrypt.hashSync(password, salt);

      const newUser = new User({
        username,
        password: hashPass
      });

      newUser.save((err) => {
        if (err) {
          res.render("base", {
            message: "Something went wrong",
            section: "signup"
          });
        } else {
          res.redirect("/");
        }
      });
    })
    .catch((error) => {
      next(error);
    });
});

app.get("/login", (req, res) => {
  res.render("base", {
    message: req.flash("error"),
    section: "login"
  });
});

// invoked via passport.use(new LocalStrategy({
app.post(
  "/login",
  passport.authenticate("local", {
    successReturnToOrRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
    passReqToCallback: true
  })
);

function checkRoles(roles) {
  // eslint-disable-next-line
  return function(req, res, next) {
    if (req.isAuthenticated() && roles.includes(req.user.role)) {
      return next();
    } else {
      if (req.isAuthenticated()) {
        res.redirect("/");
      } else {
        res.redirect("/login");
      }
    }
  };
}

// js curry
const checkAdminOrEditor = checkRoles(["ADMIN", "EDITOR"]);
const checkAdmin = checkRoles(["ADMIN"]);

app.get("/private-page-admin-editors", checkAdminOrEditor, (req, res) => {
  res.render("onlyforadminseditors", {
    user: req.user,
    section: "private"
  });
});

app.get("/private-page-admin", checkAdmin, (req, res) => {
  res.render("onlyforadmins", {
    user: req.user,
    section: "private"
  });
});

app.get("/private-page", ensureLogin.ensureLoggedIn(), (req, res) => {
  res.render("base", {
    user: req.user,
    section: "private"
  });
});

app.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/login");
});

app.listen(3100);