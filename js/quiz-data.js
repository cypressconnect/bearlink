// ─── FBLA Practice Quiz Data — 2025-2026 High School Competitive Events ──────
// PRACTICE_EVENTS.groups  → dropdown structure (optgroups + options)
// PRACTICE_EVENTS.questions[id] → array of question objects for that event
//
// Question object shape:
//   { q: string, options: [A,B,C,D], answer: 0-3, explanation: string }

const PRACTICE_EVENTS = {

    // ── Dropdown groups ────────────────────────────────────────────────────────
    groups: [
        {
            name: "General Business & Management",
            events: [
                { id: "business-communication",     name: "Business Communication",              available: true  },
                { id: "business-law",               name: "Business Law",                        available: true  },
                { id: "human-resource-management",  name: "Human Resource Management",           available: false },
                { id: "organizational-leadership",  name: "Organizational Leadership",           available: false },
                { id: "project-management",         name: "Project Management",                  available: false },
                { id: "public-administration",      name: "Public Administration & Management",  available: false },
                { id: "retail-management",          name: "Retail Management (NEW)",             available: false }
            ]
        },
        {
            name: "Finance & Accounting",
            events: [
                { id: "accounting",                 name: "Accounting",                          available: true  },
                { id: "advanced-accounting",        name: "Advanced Accounting",                 available: false },
                { id: "advertising",                name: "Advertising",                         available: false },
                { id: "economics",                  name: "Economics",                           available: true  },
                { id: "insurance-risk-management",  name: "Insurance & Risk Management",         available: false },
                { id: "personal-finance",           name: "Personal Finance",                    available: false },
                { id: "real-estate",                name: "Real Estate (NEW)",                   available: false },
                { id: "securities-investments",     name: "Securities & Investments",            available: false }
            ]
        },
        {
            name: "Technology & Coding",
            events: [
                { id: "coding-programming",         name: "Coding & Programming",                available: false },
                { id: "computer-problem-solving",   name: "Computer Problem Solving",            available: false },
                { id: "cybersecurity",              name: "Cybersecurity",                       available: true  },
                { id: "data-science-ai",            name: "Data Science & AI (NEW)",             available: false },
                { id: "networking-infrastructures", name: "Networking Infrastructures",          available: false }
            ]
        },
        {
            name: "9th & 10th Grade Events",
            events: [
                { id: "intro-business-communication", name: "Introduction to Business Communication", available: false },
                { id: "intro-business-concepts",      name: "Introduction to Business Concepts",      available: true  },
                { id: "intro-business-procedures",    name: "Introduction to Business Procedures",    available: false },
                { id: "intro-information-technology", name: "Introduction to Information Technology", available: false },
                { id: "intro-marketing-concepts",     name: "Introduction to Marketing Concepts",     available: false },
                { id: "intro-parliamentary-procedure",name: "Introduction to Parliamentary Procedure",available: false },
                { id: "intro-retail-merchandising",   name: "Introduction to Retail & Merchandising (NEW)", available: false },
                { id: "intro-supply-chain",           name: "Introduction to Supply Chain Management (NEW)", available: false }
            ]
        },
        {
            name: "Objective Test + Role Play (Combined Events)",
            events: [
                { id: "banking-financial-systems",    name: "Banking & Financial Systems",       available: false },
                { id: "business-management",          name: "Business Management",               available: false },
                { id: "customer-service",             name: "Customer Service",                  available: false },
                { id: "entrepreneurship",             name: "Entrepreneurship",                  available: true  },
                { id: "hospitality-event-management", name: "Hospitality & Event Management",    available: false },
                { id: "international-business",       name: "International Business",            available: false },
                { id: "management-information-systems",name:"Management Information Systems",    available: false },
                { id: "marketing",                    name: "Marketing",                         available: false },
                { id: "network-design",               name: "Network Design",                    available: false },
                { id: "parliamentary-procedure",      name: "Parliamentary Procedure",           available: false },
                { id: "sports-entertainment-management",name:"Sports & Entertainment Management",available: false },
                { id: "technology-support-services",  name: "Technology Support & Services",     available: false }
            ]
        }
    ],

    // ── Question banks ─────────────────────────────────────────────────────────
    questions: {

        // ── Business Communication ─────────────────────────────────────────────
        "business-communication": [
            {
                q: "Which of the following best describes the 'you' attitude in business writing?",
                options: [
                    "Using the word 'you' as frequently as possible",
                    "Focusing on the reader's needs and perspective rather than the writer's",
                    "Writing exclusively in second person throughout",
                    "Addressing multiple recipients in a single document"
                ],
                answer: 1,
                explanation: "The 'you' attitude means centering your message on what the reader needs, wants, or benefits from — not on what the writer wants. It builds goodwill and increases persuasion."
            },
            {
                q: "Which document is most commonly used for formal internal communication within an organization?",
                options: ["Press release", "Business letter", "Memorandum (memo)", "Executive summary"],
                answer: 2,
                explanation: "Memoranda (memos) are the standard format for formal internal communication. Business letters are used for external audiences; press releases go to the media."
            },
            {
                q: "Active voice is preferred in business writing primarily because it:",
                options: [
                    "Uses more words to provide thorough detail",
                    "Is more indirect and therefore more polite",
                    "Is clearer, more direct, and assigns responsibility",
                    "Avoids naming the subject of the action"
                ],
                answer: 2,
                explanation: "Active voice (e.g., 'The manager approved the budget') is direct and clear. Passive voice (e.g., 'The budget was approved') can obscure who did what, making messages vague."
            },
            {
                q: "Which of the following is an example of nonverbal communication?",
                options: [
                    "A formal written report",
                    "A voicemail left for a colleague",
                    "Maintaining eye contact during a presentation",
                    "A text message to a client"
                ],
                answer: 2,
                explanation: "Nonverbal communication includes body language, facial expressions, eye contact, gestures, and posture — all messages sent without spoken or written words."
            },
            {
                q: "The primary purpose of an executive summary is to:",
                options: [
                    "Replace the full report entirely",
                    "Provide a concise overview of key findings and recommendations for busy readers",
                    "List every reference and data source used",
                    "Introduce the author's professional background"
                ],
                answer: 1,
                explanation: "An executive summary condenses the report's most important points so decision-makers can quickly grasp the main conclusions without reading the full document."
            },
            {
                q: "Which of the following is NOT one of the '7 C's' of effective business communication?",
                options: ["Concise", "Correct", "Colorful", "Courteous"],
                answer: 2,
                explanation: "The 7 C's are: Clear, Concise, Concrete, Correct, Coherent, Complete, and Courteous. 'Colorful' is not part of this framework."
            },
            {
                q: "In a formal business letter, the 'salutation' refers to:",
                options: [
                    "The closing phrase such as 'Sincerely'",
                    "The greeting at the start, such as 'Dear Ms. Johnson:'",
                    "The subject line",
                    "The signature block at the end"
                ],
                answer: 1,
                explanation: "The salutation is the formal greeting that opens a letter (e.g., 'Dear Dr. Smith:'). The closing is a separate element that comes at the end."
            },
            {
                q: "Which format is most effective for presenting complex data comparisons in a business report?",
                options: [
                    "Dense narrative paragraphs",
                    "Bulleted list of descriptions",
                    "Table or chart",
                    "Footnotes"
                ],
                answer: 2,
                explanation: "Tables and charts visually organize comparative data, making patterns and differences immediately apparent to the reader — far more effective than prose for numerical comparisons."
            },
            {
                q: "'Jargon' in business communication refers to:",
                options: [
                    "Grammatical errors in formal documents",
                    "Specialized terminology familiar to a specific industry or group",
                    "Casual slang used in informal conversation",
                    "Foreign language phrases inserted for effect"
                ],
                answer: 1,
                explanation: "Jargon is technical vocabulary specific to a trade or field. While useful within an expert audience, it should be avoided or defined when communicating with a general audience."
            },
            {
                q: "When writing a persuasive business message, the most effective organizational pattern is:",
                options: [
                    "State the bad news first to get it out of the way",
                    "Begin with background history before making the request",
                    "Lead with the benefit to the reader, then support with evidence",
                    "List every possible objection before stating your position"
                ],
                answer: 2,
                explanation: "Effective persuasion opens with what matters most to the reader (the benefit or hook), then provides supporting evidence. Starting with objections or lengthy background loses the reader's attention."
            },
            {
                q: "Which of the following best describes 'channel' in the communication process?",
                options: [
                    "The feedback a receiver sends back to the sender",
                    "The medium used to transmit a message (e.g., email, phone, in-person)",
                    "The meaning the sender intends to convey",
                    "The noise that interferes with the message"
                ],
                answer: 1,
                explanation: "In the communication model, the channel is the vehicle or medium through which the message travels from sender to receiver — such as email, written letter, phone call, or face-to-face conversation."
            },
            {
                q: "A 'goodwill message' in business communication is sent to:",
                options: [
                    "Demand payment for overdue accounts",
                    "Announce a new company policy",
                    "Build and maintain positive relationships (e.g., thank-you notes, congratulations)",
                    "Formally reject a job applicant"
                ],
                answer: 2,
                explanation: "Goodwill messages include thank-you notes, congratulations, sympathy messages, and expressions of appreciation. They strengthen professional relationships without a transactional purpose."
            }
        ],

        // ── Business Law ───────────────────────────────────────────────────────
        "business-law": [
            {
                q: "Which of the following is NOT a required element of a valid contract?",
                options: ["Offer", "Acceptance", "Written form", "Consideration"],
                answer: 2,
                explanation: "Most contracts are enforceable whether written or oral. The four essential elements are offer, acceptance, consideration, and legal capacity/legality. Written form is only required for specific contracts under the Statute of Frauds."
            },
            {
                q: "The legal doctrine of 'respondeat superior' holds that:",
                options: [
                    "An employee is personally liable for an employer's negligence",
                    "An employer is liable for an employee's actions committed within the scope of employment",
                    "Both contracting parties share equal responsibility for breach",
                    "A principal is never liable for an agent's torts"
                ],
                answer: 1,
                explanation: "Respondeat superior ('let the master answer') is a doctrine making employers vicariously liable for employee actions performed within the scope of their employment."
            },
            {
                q: "Under the Uniform Commercial Code (UCC), the 'battle of the forms' doctrine primarily applies to:",
                options: [
                    "Negotiable instruments such as checks",
                    "Real estate purchase agreements",
                    "Sales of goods between merchants where offer and acceptance contain different terms",
                    "Employment contracts"
                ],
                answer: 2,
                explanation: "UCC §2-207 governs situations where a buyer and seller exchange forms with conflicting terms. It allows a contract to form even when acceptance introduces new or different terms, particularly in merchant-to-merchant transactions."
            },
            {
                q: "Which type of business structure provides limited liability for all owners while allowing pass-through taxation?",
                options: ["General partnership", "Sole proprietorship", "Limited Liability Company (LLC)", "C-Corporation"],
                answer: 2,
                explanation: "An LLC combines the limited liability protection of a corporation with the pass-through taxation of a partnership, meaning profits and losses flow to owners' personal tax returns without corporate-level tax."
            },
            {
                q: "A 'quasi-contract' is a remedy imposed by courts to:",
                options: [
                    "Enforce a verbal agreement that was never reduced to writing",
                    "Prevent unjust enrichment when no actual contract exists",
                    "Award punitive damages for intentional fraud",
                    "Void a bilateral contract based on mutual mistake"
                ],
                answer: 1,
                explanation: "Quasi-contracts are not real contracts; they are legal fictions imposed by courts to prevent one party from being unjustly enriched at another's expense when no express contract was formed."
            },
            {
                q: "The doctrine of 'piercing the corporate veil' allows courts to:",
                options: [
                    "Force competitors to disclose trade secrets",
                    "Hold individual shareholders personally liable for corporate debts",
                    "Void contracts entered into by a corporation under duress",
                    "Require corporate officers to personally guarantee loans"
                ],
                answer: 1,
                explanation: "Piercing the corporate veil removes the limited liability shield when shareholders abuse the corporate form — for example, by commingling personal and corporate funds or using the corporation to commit fraud."
            },
            {
                q: "The Statute of Frauds requires which of the following contracts to be in writing to be enforceable?",
                options: [
                    "A one-week contract for lawn-mowing services",
                    "A sale of goods valued at $400",
                    "A contract for the sale of real property",
                    "An employment contract for five months"
                ],
                answer: 2,
                explanation: "The Statute of Frauds requires certain contracts to be written, including: sale of land, contracts that cannot be performed within one year, sale of goods ≥$500 (UCC), and suretyship agreements."
            },
            {
                q: "Under Chapter 7 of the U.S. Bankruptcy Code, a debtor's non-exempt assets are:",
                options: [
                    "Reorganized into a repayment plan over three to five years",
                    "Protected from all creditor claims indefinitely",
                    "Liquidated by a trustee to pay creditors, and remaining dischargeable debts are eliminated",
                    "Transferred to a government-appointed receiver"
                ],
                answer: 2,
                explanation: "Chapter 7 is liquidation bankruptcy. A trustee sells the debtor's non-exempt assets to pay creditors. Most remaining unsecured debts are then discharged, giving the debtor a fresh start."
            },
            {
                q: "Which of the following best describes 'promissory estoppel' as a substitute for consideration?",
                options: [
                    "A court enforces a promise because the promisor acted fraudulently",
                    "A promise is enforced because the promisee reasonably relied on it and suffered a detriment",
                    "A promise is unenforceable if made without a written record",
                    "A court enforces a promise when both parties are merchants"
                ],
                answer: 1,
                explanation: "Promissory estoppel (detrimental reliance) makes a promise enforceable without consideration when: (1) the promisor should have expected reliance, (2) the promisee relied on the promise, and (3) injustice can only be avoided by enforcement."
            },
            {
                q: "An 'intentional tort' differs from negligence primarily because:",
                options: [
                    "Intentional torts always result in higher damages",
                    "The defendant acted with purpose or knowledge that harm was substantially certain to result",
                    "Negligence requires physical injury while intentional torts do not",
                    "Only intentional torts can be covered by liability insurance"
                ],
                answer: 1,
                explanation: "Intentional torts (assault, battery, defamation, etc.) require that the defendant acted with intent to bring about a particular result. Negligence involves a failure to exercise reasonable care — there is no intent to harm."
            },
            {
                q: "A 'mechanic's lien' is a security interest that attaches to:",
                options: [
                    "A debtor's personal property pledged as collateral",
                    "A bank account in which funds have been deposited",
                    "Real property on which labor or materials were provided but unpaid",
                    "Intellectual property created during employment"
                ],
                answer: 2,
                explanation: "A mechanic's lien gives contractors, subcontractors, and material suppliers a security interest in the property they improved when they haven't been paid. It can lead to forced sale of the property to satisfy the debt."
            },
            {
                q: "Under agency law, an 'apparent authority' arises when:",
                options: [
                    "A principal expressly authorizes an agent in writing",
                    "A third party reasonably believes an agent has authority based on the principal's conduct",
                    "An agent acts beyond the scope of their actual authority",
                    "A court grants authority after the fact through ratification"
                ],
                answer: 1,
                explanation: "Apparent authority exists when a principal's words or actions cause a third party to reasonably believe the agent is authorized to act on the principal's behalf, even if the agent has no actual authority."
            }
        ],

        // ── Accounting ────────────────────────────────────────────────────────
        "accounting": [
            {
                q: "The fundamental accounting equation states that:",
                options: [
                    "Assets = Liabilities + Owner's Equity",
                    "Assets = Revenue − Expenses",
                    "Liabilities = Assets + Owner's Equity",
                    "Revenue − Expenses = Owner's Equity"
                ],
                answer: 0,
                explanation: "The accounting equation (Assets = Liabilities + Owner's Equity) is the foundation of double-entry bookkeeping. Every transaction maintains this balance."
            },
            {
                q: "Which financial statement reports a company's revenues and expenses over a specific period?",
                options: ["Balance sheet", "Statement of cash flows", "Income statement", "Statement of retained earnings"],
                answer: 2,
                explanation: "The income statement (also called the profit & loss statement) shows revenues, expenses, and net income or loss for a defined accounting period — month, quarter, or year."
            },
            {
                q: "The double-entry bookkeeping principle requires that for every transaction:",
                options: [
                    "Every transaction be recorded twice in the same account",
                    "Every debit entry has a corresponding credit entry of equal amount",
                    "Two separate accountants must verify the record",
                    "All accounts must be reconciled at month-end"
                ],
                answer: 1,
                explanation: "Double-entry bookkeeping records each transaction as both a debit in one account and an equal credit in another. This keeps the accounting equation in balance and reduces errors."
            },
            {
                q: "Accounts receivable appears on the balance sheet as:",
                options: ["A long-term (non-current) asset", "A current liability", "A current asset", "Owner's equity"],
                answer: 2,
                explanation: "Accounts receivable are amounts owed to the company by customers from credit sales. Since they are expected to be collected within one year, they are classified as current assets."
            },
            {
                q: "Which depreciation method allocates an equal dollar amount of expense each accounting period?",
                options: ["Double-declining balance", "Sum-of-years-digits", "Units of production", "Straight-line"],
                answer: 3,
                explanation: "The straight-line method: Annual Depreciation = (Cost − Salvage Value) ÷ Useful Life. It spreads cost evenly, making it the simplest and most commonly used method."
            },
            {
                q: "Recording a debit to an expense account will:",
                options: [
                    "Decrease the expense balance",
                    "Increase the expense balance",
                    "Have no effect on net income",
                    "Increase owner's equity"
                ],
                answer: 1,
                explanation: "Expenses have normal debit balances. Debiting an expense account increases it, which in turn decreases net income and ultimately reduces owner's equity."
            },
            {
                q: "Under the FIFO (First-In, First-Out) inventory method, which units are assumed to be sold first?",
                options: [
                    "The most recently purchased units",
                    "Units selected at random",
                    "The oldest units in inventory",
                    "Units with the highest cost"
                ],
                answer: 2,
                explanation: "FIFO assumes the oldest inventory (first purchased) is sold first. During rising prices, FIFO produces a higher ending inventory value and a lower cost of goods sold compared to LIFO."
            },
            {
                q: "The matching principle in accounting requires that:",
                options: [
                    "Total debits match total credits in every entry",
                    "Expenses be recognized in the same period as the revenues they helped generate",
                    "All financial statements follow the same presentation format",
                    "Assets always equal liabilities on every reporting date"
                ],
                answer: 1,
                explanation: "The matching principle is a core accrual accounting concept: expenses must be recorded in the period that benefited from them, not simply when cash changes hands."
            },
            {
                q: "A trial balance is prepared to:",
                options: [
                    "Determine a company's net income for the period",
                    "Verify that total debits equal total credits in the general ledger",
                    "Prepare the company's federal income tax return",
                    "Allocate overhead costs to departments"
                ],
                answer: 1,
                explanation: "A trial balance lists all ledger accounts and their balances. If debits equal credits, arithmetic accuracy of the ledger is confirmed — though it does not detect all types of errors."
            },
            {
                q: "Which of the following would be found on a balance sheet but NOT on an income statement?",
                options: ["Sales revenue", "Operating expenses", "Accumulated depreciation", "Cost of goods sold"],
                answer: 2,
                explanation: "Accumulated depreciation is a contra-asset account that appears on the balance sheet, reducing the book value of property, plant, and equipment. Revenue and expenses appear on the income statement."
            },
            {
                q: "When a company issues stock in exchange for cash, the journal entry is:",
                options: [
                    "Debit Common Stock; Credit Cash",
                    "Debit Cash; Credit Common Stock",
                    "Debit Retained Earnings; Credit Cash",
                    "Debit Dividends; Credit Common Stock"
                ],
                answer: 1,
                explanation: "Issuing stock for cash increases the asset Cash (debit) and increases the equity account Common Stock (credit), keeping the accounting equation in balance."
            },
            {
                q: "The current ratio is calculated as:",
                options: [
                    "Net Income ÷ Total Assets",
                    "Current Assets ÷ Current Liabilities",
                    "Total Revenue ÷ Total Expenses",
                    "Owner's Equity ÷ Total Liabilities"
                ],
                answer: 1,
                explanation: "The current ratio measures short-term liquidity. A ratio above 1.0 means the company has more current assets than current liabilities, indicating it can cover near-term obligations."
            }
        ],

        // ── Economics ─────────────────────────────────────────────────────────
        "economics": [
            {
                q: "When the price of a good rises and quantity demanded falls, this represents:",
                options: [
                    "A shift of the demand curve to the left",
                    "A movement along the demand curve",
                    "An increase in the supply of the good",
                    "A market failure"
                ],
                answer: 1,
                explanation: "A change in a good's own price causes movement along an existing demand curve (a change in quantity demanded), not a shift of the curve. Shifts are caused by changes in income, tastes, prices of related goods, etc."
            },
            {
                q: "If the price elasticity of demand for a product is 2.5, the demand is considered:",
                options: ["Perfectly inelastic", "Inelastic", "Unit elastic", "Elastic"],
                answer: 3,
                explanation: "Price elasticity of demand > 1 means demand is elastic — consumers are relatively sensitive to price changes. A value of 2.5 means a 1% price increase leads to a 2.5% decrease in quantity demanded."
            },
            {
                q: "Gross Domestic Product (GDP) is best defined as:",
                options: [
                    "The total income earned by a nation's citizens both at home and abroad",
                    "The market value of all final goods and services produced within a country in a given year",
                    "The total value of a nation's exports minus its imports",
                    "The government's total annual budget expenditures"
                ],
                answer: 1,
                explanation: "GDP measures the market value of all final (not intermediate) goods and services produced within a country's borders in a specific time period, regardless of the producer's nationality."
            },
            {
                q: "Which characteristic is unique to a perfectly competitive market?",
                options: [
                    "One dominant seller controls pricing",
                    "Products are highly differentiated by brand",
                    "Many buyers and sellers trade a homogeneous product, with no single participant affecting price",
                    "Firms earn above-normal profits in the long run"
                ],
                answer: 2,
                explanation: "Perfect competition requires: many buyers and sellers, a homogeneous product, free entry and exit, and perfect information. Each firm is a price taker — too small to influence the market price."
            },
            {
                q: "The law of diminishing marginal returns states that:",
                options: [
                    "Returns increase indefinitely as more inputs are added",
                    "Beyond some point, adding more variable input to a fixed input yields smaller additional output",
                    "Firms always experience losses in the long run",
                    "Consumer satisfaction decreases with the very first unit consumed"
                ],
                answer: 1,
                explanation: "Diminishing marginal returns occur in the short run when one input (e.g., labor) is added to a fixed input (e.g., capital). After a point, each additional worker adds less output than the previous one."
            },
            {
                q: "A 'public good' is characterized by being:",
                options: [
                    "Any good sold or subsidized by the government",
                    "Non-excludable and non-rivalrous in consumption",
                    "Subject to high import tariffs",
                    "Produced exclusively for export markets"
                ],
                answer: 1,
                explanation: "Public goods are non-excludable (you can't prevent people from using them) and non-rivalrous (one person's use doesn't reduce availability for others). Examples: national defense, lighthouses, public fireworks."
            },
            {
                q: "Stagflation refers to a combination of:",
                options: [
                    "High economic growth and high inflation",
                    "High unemployment with low inflation and deflation",
                    "High inflation and high unemployment occurring simultaneously",
                    "Low growth and falling price levels"
                ],
                answer: 2,
                explanation: "Stagflation is an unusual and difficult condition combining stagnation (high unemployment, slow growth) with inflation. It defies the typical Phillips Curve trade-off and was notably experienced in the U.S. during the 1970s."
            },
            {
                q: "The fiscal multiplier effect describes how:",
                options: [
                    "Compound interest grows an investment over time",
                    "An initial change in government spending creates a larger total change in GDP",
                    "Changes in price levels affect the money supply",
                    "Lower tax rates automatically generate higher tax revenues"
                ],
                answer: 1,
                explanation: "The multiplier effect means $1 of new government spending generates more than $1 of economic activity, because the initial spending becomes income for others who then spend a portion of it, and so on."
            },
            {
                q: "Which of the following is an example of contractionary fiscal policy?",
                options: [
                    "The Federal Reserve lowering the federal funds rate",
                    "Congress increasing government infrastructure spending",
                    "Congress raising income tax rates to reduce a budget deficit",
                    "The Federal Reserve purchasing government securities"
                ],
                answer: 2,
                explanation: "Contractionary fiscal policy reduces aggregate demand to fight inflation: raising taxes (reduces consumer spending) or cutting government expenditures. Note: Interest rate changes are monetary policy, not fiscal policy."
            },
            {
                q: "When a country has a comparative advantage in producing a good, it means:",
                options: [
                    "It produces more of that good in absolute terms than any other country",
                    "It can produce that good at a lower opportunity cost than other countries",
                    "It has the most advanced technology for producing that good",
                    "It exports more of that good than it imports"
                ],
                answer: 1,
                explanation: "Comparative advantage is about opportunity cost, not absolute output. A country should specialize in goods for which it gives up the least of other goods to produce — this is the basis of beneficial international trade."
            },
            {
                q: "A 'negative externality' occurs when:",
                options: [
                    "A firm's output creates benefits for third parties not reflected in market prices",
                    "A firm's production imposes costs on third parties not captured in the price",
                    "A product is under-produced because the government sets a price ceiling",
                    "A consumer's utility decreases as more of a good is consumed"
                ],
                answer: 1,
                explanation: "Negative externalities (e.g., pollution) impose costs on society that are not paid by the producer. This causes overproduction and market failure, often justifying taxes or regulation to internalize the external cost."
            },
            {
                q: "The 'consumer price index' (CPI) primarily measures:",
                options: [
                    "Changes in the prices of goods and services purchased by typical consumers over time",
                    "The total purchasing power of the U.S. dollar globally",
                    "Changes in wages and salaries across all industries",
                    "The rate at which businesses raise their output prices"
                ],
                answer: 0,
                explanation: "The CPI tracks price changes in a fixed market basket of goods and services typically purchased by urban consumers. It is the most widely used measure of consumer inflation in the United States."
            }
        ],

        // ── Cybersecurity ─────────────────────────────────────────────────────
        "cybersecurity": [
            {
                q: "What does the CIA Triad stand for in information security?",
                options: [
                    "Cyber Incident Assessment",
                    "Confidentiality, Integrity, Availability",
                    "Computer Interface Architecture",
                    "Cryptography, Identification, Authentication"
                ],
                answer: 1,
                explanation: "The CIA Triad is the foundational model for information security: Confidentiality (only authorized access), Integrity (data is accurate and unaltered), and Availability (systems are accessible when needed)."
            },
            {
                q: "Which type of attack involves an attacker secretly intercepting and possibly altering communications between two parties?",
                options: ["Phishing", "Man-in-the-Middle (MitM)", "SQL Injection", "Denial of Service (DoS)"],
                answer: 1,
                explanation: "A Man-in-the-Middle attack positions the attacker between a sender and receiver to eavesdrop or modify data in transit. Common examples include ARP spoofing and SSL stripping on unsecured networks."
            },
            {
                q: "Which wireless security protocol is currently recommended as the strongest for protecting Wi-Fi networks?",
                options: ["WEP (Wired Equivalent Privacy)", "WPA (Wi-Fi Protected Access)", "WPA2", "WPA3"],
                answer: 3,
                explanation: "WPA3 (released 2018) is the current standard. It uses Simultaneous Authentication of Equals (SAE) to replace the weaker Pre-Shared Key handshake in WPA2, protecting against offline dictionary attacks."
            },
            {
                q: "A 'zero-day vulnerability' refers to:",
                options: [
                    "A flaw discovered and patched within 24 hours of disclosure",
                    "A vulnerability in systems that are zero years old",
                    "A newly discovered security flaw with no available patch or fix",
                    "A weakness with zero risk of real-world exploitation"
                ],
                answer: 2,
                explanation: "Zero-day vulnerabilities are unknown to the software vendor. Attackers can exploit them freely until the vendor discovers and releases a patch, giving defenders 'zero days' to protect themselves."
            },
            {
                q: "The principle of 'least privilege' in cybersecurity means:",
                options: [
                    "Using the weakest encryption that still meets compliance requirements",
                    "Users and programs should have only the minimum access rights needed for their function",
                    "Security protocols should be as simple as possible to reduce complexity",
                    "Only privileged administrators can install software"
                ],
                answer: 1,
                explanation: "Least privilege limits the damage from compromised accounts or insider threats by ensuring users and processes can only access what they absolutely need. It is a core principle of Zero Trust architecture."
            },
            {
                q: "What is the main purpose of a network DMZ (Demilitarized Zone)?",
                options: [
                    "To store encrypted database backups off-site",
                    "To isolate public-facing servers from the trusted internal network",
                    "To block all inbound internet traffic with a firewall",
                    "To monitor and log all employee internet activity"
                ],
                answer: 1,
                explanation: "A DMZ is a subnet that sits between the public internet and the private internal network. Public-facing services (web servers, mail servers) go in the DMZ, so a breach doesn't directly expose the internal network."
            },
            {
                q: "Which type of malware encrypts a victim's files and demands payment — typically in cryptocurrency — for the decryption key?",
                options: ["Spyware", "Adware", "Ransomware", "Rootkit"],
                answer: 2,
                explanation: "Ransomware encrypts files and extorts victims. High-profile attacks include WannaCry (2017) and Colonial Pipeline (2021). Best defenses include offline backups, patching, and email filtering."
            },
            {
                q: "Multi-factor authentication (MFA) increases security because it requires:",
                options: [
                    "The user to remember two different passwords",
                    "Two or more different categories of credentials (e.g., something you know + something you have)",
                    "The password to be changed every 30 days",
                    "A minimum password length of 12 characters"
                ],
                answer: 1,
                explanation: "MFA combines categories: something you know (password), something you have (phone/token), and something you are (biometric). Even if one factor is stolen, the attacker still lacks the others."
            },
            {
                q: "In cybersecurity, a 'honeypot' is:",
                options: [
                    "A type of intrusion prevention firewall",
                    "A decoy system designed to lure and study attackers without exposing real assets",
                    "An encrypted container for storing sensitive credentials",
                    "Antivirus software that runs in a sandboxed environment"
                ],
                answer: 1,
                explanation: "Honeypots are deliberately vulnerable decoy systems. When attackers interact with them, security teams gather threat intelligence about attack methods and indicators of compromise without risking real infrastructure."
            },
            {
                q: "What does 'social engineering' refer to in the context of cybersecurity?",
                options: [
                    "Using social media platforms to distribute malware",
                    "Manipulating people psychologically into revealing confidential information or performing actions",
                    "Engineering secure social networking applications",
                    "Monitoring employee behavior on social media for security risks"
                ],
                answer: 1,
                explanation: "Social engineering exploits human psychology rather than technical vulnerabilities. Phishing, pretexting, baiting, and tailgating are all social engineering tactics. Humans are often the weakest link in security."
            },
            {
                q: "Which type of scan does a port scanner (such as nmap) use to identify open network ports without completing the TCP handshake?",
                options: ["Full connect scan", "SYN (half-open) scan", "UDP scan", "Ping sweep"],
                answer: 1,
                explanation: "A SYN scan sends a SYN packet and checks for a SYN-ACK response without completing the handshake (no ACK is sent). This is stealthier than a full connect scan because it leaves fewer logs on the target."
            },
            {
                q: "The NIST Cybersecurity Framework's five core functions are:",
                options: [
                    "Prevent, Detect, Respond, Recover, Report",
                    "Identify, Protect, Detect, Respond, Recover",
                    "Assess, Harden, Monitor, Contain, Restore",
                    "Plan, Do, Check, Act, Audit"
                ],
                answer: 1,
                explanation: "The NIST CSF (2014, updated 2024) organizes cybersecurity activities into: Identify (assets & risks), Protect (controls), Detect (anomalies), Respond (incidents), and Recover (restoration). It is widely adopted in industry."
            }
        ],

        // ── Introduction to Business Concepts ────────────────────────────────
        "intro-business-concepts": [
            {
                q: "In economics, 'scarcity' means that:",
                options: [
                    "Resources are unlimited and must be preserved carefully",
                    "People's unlimited wants exceed the limited resources available to satisfy them",
                    "Only scarce goods can be traded in a market",
                    "Governments must control resource distribution"
                ],
                answer: 1,
                explanation: "Scarcity is the fundamental economic problem: because resources (land, labor, capital) are limited but human wants are unlimited, every society must make choices about what to produce, how to produce it, and for whom."
            },
            {
                q: "Which business ownership structure has a single owner who bears unlimited personal liability?",
                options: ["Limited Liability Company (LLC)", "S-Corporation", "Sole proprietorship", "General partnership"],
                answer: 2,
                explanation: "A sole proprietorship is the simplest form — one person owns and operates the business. The owner receives all profits but also has unlimited personal liability for all business debts."
            },
            {
                q: "Which of the following is an example of a variable cost?",
                options: [
                    "Monthly rent on the store",
                    "Annual property insurance premium",
                    "Raw materials used per unit produced",
                    "Straight-line depreciation on equipment"
                ],
                answer: 2,
                explanation: "Variable costs change directly with the level of production or sales. Raw materials increase as more units are made. Fixed costs (rent, insurance, depreciation) remain constant regardless of output level."
            },
            {
                q: "The primary role of supply and demand in a market economy is to determine:",
                options: [
                    "Government tax rates on businesses",
                    "Market prices and quantities of goods and services",
                    "The minimum wage set by law",
                    "Corporate tax structures and deductions"
                ],
                answer: 1,
                explanation: "In a free market, prices are determined by the interaction of supply (producers' willingness to sell) and demand (consumers' willingness to buy), without government control over individual prices."
            },
            {
                q: "An entrepreneur is best described as someone who:",
                options: [
                    "Works as a senior manager at a large corporation",
                    "Manages government economic programs",
                    "Assumes risk to create and operate a new business in pursuit of profit",
                    "Provides loans to businesses from a financial institution"
                ],
                answer: 2,
                explanation: "Entrepreneurs are risk-takers who organize resources to launch new ventures. They are considered one of the four factors of production (land, labor, capital, entrepreneurship) and drive economic innovation."
            },
            {
                q: "Which of the following is NOT one of the four factors of production?",
                options: ["Land", "Labor", "Capital", "Profit"],
                answer: 3,
                explanation: "The four factors of production are: Land (natural resources), Labor (human effort), Capital (tools, machinery, money), and Entrepreneurship. Profit is the reward for entrepreneurship, not a factor itself."
            },
            {
                q: "'Gross profit' is calculated as:",
                options: [
                    "Net sales minus all operating expenses (including rent and salaries)",
                    "Net sales minus cost of goods sold",
                    "Total revenue minus income taxes",
                    "Operating income plus interest income"
                ],
                answer: 1,
                explanation: "Gross Profit = Net Sales − Cost of Goods Sold (COGS). It measures how efficiently a company produces its goods before accounting for overhead, administrative, and other operating expenses."
            },
            {
                q: "A company's 'mission statement' communicates its:",
                options: [
                    "Specific financial targets for the next fiscal year",
                    "Core purpose, values, and reason for existence",
                    "Organizational chart and reporting structure",
                    "Detailed product pricing strategy"
                ],
                answer: 1,
                explanation: "A mission statement defines why a company exists and what it stands for — its purpose and values. It guides decisions and culture. A vision statement (different) describes where the company wants to go in the future."
            },
            {
                q: "Which of the following best defines 'opportunity cost'?",
                options: [
                    "The direct monetary cost of purchasing a resource",
                    "The value of the next best alternative forgone when a choice is made",
                    "The total cost of producing one additional unit",
                    "The profit lost due to an unexpected market downturn"
                ],
                answer: 1,
                explanation: "Opportunity cost is the value of the best alternative you give up when making a decision. For example, if you use $10,000 to start a business, the opportunity cost might be the interest you could have earned investing it."
            },
            {
                q: "Which U.S. government agency is primarily responsible for enforcing antitrust laws and preventing anticompetitive business practices?",
                options: [
                    "Securities and Exchange Commission (SEC)",
                    "Internal Revenue Service (IRS)",
                    "Federal Trade Commission (FTC)",
                    "Food and Drug Administration (FDA)"
                ],
                answer: 2,
                explanation: "The FTC and the Department of Justice (DOJ) Antitrust Division jointly enforce antitrust laws in the U.S. They investigate mergers, price-fixing agreements, and other practices that reduce competition."
            },
            {
                q: "In a 'market economy,' production and pricing decisions are primarily made by:",
                options: [
                    "The central government through economic planning",
                    "Producers and consumers interacting through supply and demand",
                    "A council of labor unions and industry groups",
                    "International trade organizations"
                ],
                answer: 1,
                explanation: "In a market (capitalist) economy, private individuals and businesses make most economic decisions. Prices act as signals, guiding resource allocation without central planning."
            },
            {
                q: "The term 'break-even point' refers to the level of output where:",
                options: [
                    "A business earns its maximum possible profit",
                    "Total revenue exactly equals total costs, resulting in zero profit or loss",
                    "Variable costs equal fixed costs",
                    "The business must legally close operations"
                ],
                answer: 1,
                explanation: "Break-even = Fixed Costs ÷ (Price − Variable Cost per Unit). At this output level, revenue covers all costs but generates no profit. Selling above break-even yields profit; below it results in a loss."
            }
        ],

        // ── Entrepreneurship ──────────────────────────────────────────────────
        "entrepreneurship": [
            {
                q: "Which of the following best describes a 'value proposition'?",
                options: [
                    "The final price at which a product is offered to customers",
                    "The unique benefit a business offers that solves a specific customer problem better than alternatives",
                    "The total market value of a company's assets",
                    "The commission structure offered to a sales team"
                ],
                answer: 1,
                explanation: "A value proposition explains why a customer should choose your product or service. It articulates the specific problem solved, the benefit delivered, and why you're better than the competition."
            },
            {
                q: "A SWOT analysis evaluates a business's:",
                options: [
                    "Sales trends, Workflow efficiency, Operations, and Technology",
                    "Strengths, Weaknesses, Opportunities, and Threats",
                    "Strategy, Warning signs, Objectives, and Tactics",
                    "Supply chain, Workforce, Output, and Trends"
                ],
                answer: 1,
                explanation: "SWOT is a strategic planning framework. Strengths and Weaknesses are internal factors the company controls. Opportunities and Threats are external environmental factors."
            },
            {
                q: "'Bootstrapping' a startup means:",
                options: [
                    "Launching with maximum venture capital funding to grow as fast as possible",
                    "Funding and growing the business using personal savings and reinvested revenue, without outside investment",
                    "Copying a successful competitor's business model",
                    "Entering a new market through a strategic acquisition"
                ],
                answer: 1,
                explanation: "Bootstrapping gives founders full ownership and control but requires disciplined cash management. Successful bootstrapped companies include Mailchimp and Basecamp, which grew profitably without VC funding."
            },
            {
                q: "An 'angel investor' is best described as:",
                options: [
                    "A government small business loan program",
                    "A high-net-worth individual who provides early-stage capital, often in exchange for equity",
                    "A commercial bank that specializes in small business lending",
                    "A nonprofit organization that mentors early-stage startups"
                ],
                answer: 1,
                explanation: "Angel investors are typically wealthy individuals who invest their own money in startups during the seed or early stage. They often provide mentorship in addition to capital and accept higher risk than venture capitalists."
            },
            {
                q: "Which of the following is NOT a standard component of a formal business plan?",
                options: ["Executive summary", "Financial projections and pro forma statements", "Employee performance review history", "Market and competitive analysis"],
                answer: 2,
                explanation: "A business plan includes: executive summary, company description, market analysis, organization/management, product/service line, marketing strategy, funding request, and financial projections. Employee performance reviews are an operational HR document, not a planning document."
            },
            {
                q: "A startup's 'burn rate' refers to:",
                options: [
                    "The compound growth rate of customer acquisition",
                    "The monthly rate at which the company spends its cash reserves",
                    "The depreciation rate of its physical assets",
                    "The rate at which employees leave the company"
                ],
                answer: 1,
                explanation: "Burn rate is the pace at which a startup uses up investor cash before becoming cash flow positive. 'Runway' = Cash on Hand ÷ Monthly Burn Rate, telling founders how many months they have before running out of money."
            },
            {
                q: "In startup terminology, a 'pivot' means:",
                options: [
                    "Expanding the business into an international market",
                    "Hiring a new CEO to replace the founder",
                    "Making a fundamental change to the business model, product, or target market based on new evidence",
                    "Acquiring a direct competitor to consolidate market share"
                ],
                answer: 2,
                explanation: "A pivot is a structured course correction when evidence shows the current direction isn't working. Famous pivots include Instagram (from Burbn), YouTube (from a dating site), and Slack (from a gaming company)."
            },
            {
                q: "Break-even analysis answers the question:",
                options: [
                    "What is the maximum profit this business can generate?",
                    "How many units must be sold for total revenue to equal total costs?",
                    "What is the optimal price to charge for this product?",
                    "How many employees does this business need to operate efficiently?"
                ],
                answer: 1,
                explanation: "Break-Even Units = Fixed Costs ÷ (Selling Price − Variable Cost per Unit). This tells entrepreneurs the minimum sales volume required to avoid a loss, which is critical for pricing and planning decisions."
            },
            {
                q: "A 'minimum viable product' (MVP) is defined as:",
                options: [
                    "The cheapest version of a product that can be produced",
                    "A version with the minimum features necessary to satisfy early adopters and validate the core hypothesis",
                    "A prototype only shown internally and never to customers",
                    "The final product stripped of premium features for budget customers"
                ],
                answer: 1,
                explanation: "The MVP concept (from Lean Startup methodology) says build just enough to test your core assumption with real customers. Validated learning from MVPs prevents wasting resources building features nobody wants."
            },
            {
                q: "Which type of intellectual property protection covers a new, non-obvious invention or process?",
                options: ["Copyright", "Trademark", "Patent", "Trade secret"],
                answer: 2,
                explanation: "Patents protect inventions and give the holder exclusive rights to make, use, or sell the invention for 20 years (utility patent). Copyrights protect creative works; trademarks protect brand identifiers; trade secrets protect confidential business information."
            },
            {
                q: "Venture capital (VC) firms typically invest in startups that have:",
                options: [
                    "Steady cash flows with low growth potential and established customer bases",
                    "High growth potential and scalable business models, usually in exchange for equity",
                    "Primarily government contracts and public-sector revenue",
                    "Already gone public on a stock exchange"
                ],
                answer: 1,
                explanation: "VCs seek companies that can grow very rapidly and produce outsized returns (10x+). They accept high risk across a portfolio, expecting most investments to fail but a few to deliver exceptional returns that offset the losses."
            },
            {
                q: "The 'lean startup' methodology emphasizes:",
                options: [
                    "Minimizing headcount by automating all operations",
                    "Building a minimum viable product, measuring real customer behavior, and iterating quickly",
                    "Cutting the marketing budget to extend runway",
                    "Outsourcing all non-core functions to reduce overhead"
                ],
                answer: 1,
                explanation: "Eric Ries's Lean Startup methodology uses a Build-Measure-Learn feedback loop to reduce waste and uncertainty. The goal is to test assumptions with real users as quickly as possible and adjust course based on validated learning."
            }
        ]

    } // end questions
}; // end PRACTICE_EVENTS
