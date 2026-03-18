const express = require('express');
const app = express();
const path = require('path');
const methodOverride = require('method-override');
const mysql = require('mysql2');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcrypt');

// ======= DATABASE CONNECTION =======
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error('DB connection failed:', err);
    } else {
        console.log('Connected to MySQL!');
    }
});

// ======= MIDDLEWARE =======
app.use(cors({
    origin: process.env.FRONTEND_URL, // Netlify frontend URL
    credentials: true
}));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secretkey-1010',
    resave: false,
    saveUninitialized: false
}));

app.use(methodOverride('_method'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ======= ROUTES =======

// Login page
app.get('/', (req, res) => {
    const showError = req.query.error === '1';
    res.render('login', { showError });
});

// Login POST
app.post('/', async (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) throw err;
        const user = results[0];

        if (user && await bcrypt.compare(password, user.password_hash)) {
            req.session.userId = user.id;
            res.redirect('/home');
        } else {
            res.redirect('/?error=1');
        }
    });
});

// Signup page
app.get('/signup', (req, res) => {
    res.render('signup');
});

// Signup POST
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    db.query(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name, email, hashed],
        err => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.render('signup', { error: 'Email already in use' });
                }
                throw err;
            }
            res.redirect('/');
        }
    );
});

// Home page showing events
app.get('/home', (req, res) => {
    db.query('SELECT * FROM events', (err, results) => {
        if (err) throw err;
        res.render('home', { event: results });
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.send('Error logging out');
        res.redirect('/');
    });
});

// Book ticket page
app.get('/book/:eid', (req, res) => {
    const eventid = req.params.eid;
    res.render('book_ticket', { eventid });
});

// Book ticket PATCH
app.patch('/book/:eid', (req, res) => {
    const eventid = req.params.eid;
    const { tier, quantity } = req.body;
    const qty = parseInt(quantity);
    const userId = req.session.userId;

    db.query(
        'SELECT title, available_seats, tier1_price, tier2_price, tier3_price FROM events WHERE id = ?',
        [eventid],
        (err, results) => {
            if (err) throw err;
            const event = results[0];
            const available = event.available_seats;

            if (available >= qty) {
                let totalprice = 0;
                if (tier === "tier1") totalprice = qty * event.tier1_price;
                if (tier === "tier2") totalprice = qty * event.tier2_price;
                if (tier === "tier3") totalprice = qty * event.tier3_price;

                res.render('payment', { eventid, eventName: event.title, tier, qty, totalprice });
            } else {
                res.render('book_ticket', { eventid, error: 'Not enough seats available' });
            }
        }
    );
});

// Payment POST
app.post('/pay', (req, res) => {
    const { eventid, tier, qty, totalprice } = req.body;
    const userId = req.session.userId;

    db.query('SELECT available_seats FROM events WHERE id = ?', [eventid], (err, results) => {
        if (err) throw err;
        const available = results[0].available_seats;
        const quantity = parseInt(qty);
        const updatedSeats = available - quantity;

        db.query('UPDATE events SET available_seats = ? WHERE id = ?', [updatedSeats, eventid], (err) => {
            if (err) throw err;

            db.query(
                'INSERT INTO bookings (user_id, event_id, num_tickets, total_price) VALUES (?, ?, ?, ?)',
                [userId, eventid, quantity, totalprice],
                err => {
                    if (err) throw err;
                    res.redirect('/confirm');
                }
            );
        });
    });
});

// My tickets page
app.get('/mytickets', (req, res) => {
    const userId = req.session.userId;
    db.query(
        'SELECT b.*, e.title FROM bookings b JOIN events e ON b.event_id = e.id WHERE b.user_id = ?',
        [userId],
        (err, results) => {
            if (err) throw err;
            res.render('mytickets', { tickets: results });
        }
    );
});

// Confirmation page
app.get('/confirm', (req, res) => {
    res.render('confirm');
});

// ======= HOST ROUTES =======
// Keep your host routes (host login, signup, create events) here
// Use bcrypt for passwords same as user routes

// ======= START SERVER =======
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});