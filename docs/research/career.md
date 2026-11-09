# Career mode: a co-op general manager's job, pay and contract (D-142)

Research notes for career mode. They come from web-search extracts and background estimates.
Values in `src/data/career.ts` are low confidence and listed in `docs/DATA_REVIEW.md`.

## Pay and bonuses

- USDA Rural Development surveys of farmer co-ops cover CEO, president and general manager pay
  and bonuses by co-op type. About a third of co-ops paid bonuses to all listed employees,
  usually tied to the co-op's financial results.
  - [USDA RD RR-228](https://Www.Rd.Usda.gov/sites/default/files/RR228.pdf)
  - [USDA RD RR-114](https://rd.usda.gov/sites/default/files/rr114.pdf)
  - [AgEcon Search RR-189](https://ageconsearch.umn.edu/record/280082/files/RR189.pdf)
- Co-op manager compensation surveys show bonus targets of 10–20% of base as the most common
  range, with 18% of managers above 20%. Compensation consultants recommend 15% or more for a CEO,
  and 15% is a frequent benchmark. Example plans cap the GM bonus at 15% of base, or offer up to
  25% split between financial results and strategic goals. These surveys are of food co-ops; no
  current figure for ag co-ops turned up.
  - [Survey highlights gaps in manager compensation](https://archive.grocer.coop/node/6648)
  - [Improving general manager compensation packages](https://archive.grocer.coop/node/6981)
  - [Manager compensation](https://archive.grocer.coop/node/6718)
- The game keeps its existing market rate for the GM's job: base plus amounts per member and per
  location in 2024 dollars (`OVERHEAD.gmSalary*`, D-098).
  - A board offers that rate scaled by the GM's reputation, from 0.88× to 1.25×.
  - The bonus target defaults to 15%. It pays nothing at a review score of 50, the target at 75,
    and twice the target at 100.

## Employment agreements

- Many executive agreements are at will, with severance owed when the board ends the job without
  cause and none when it is for cause. A pre-agreed six months' salary is a common example.
  - [BoardSource: elements of a chief executive employment contract](https://boardsource.org/resources/chief-executive-employment-contract/)
  - [ASAE: best practices for association CEO contracts](https://asaecenter.org/resources/articles/an_plus/2020/march/best-practices-for-association-ceo-employment-contracts)
  - [Fisher Phillips: should your nonprofit exec have a contract](https://www.fisherphillips.com/a/web/5hAHXA1PVJNwSHh4WKpk84/bqatuo/shoud-your-nonprofit-exec-have-a-contract.pdf)
- A co-op GM's terms are negotiated with the board. In one Vermont co-op, an interim GM turned
  down the board's first offer of the permanent job, and the two sides negotiated for weeks.
  - [Valley News](https://vnews.com/2020/09/21/hanover-co-op-in-turmoil-in-wake-of-resignations-36205564/)
- The game uses three-year agreements with six months' severance by default. Severance is owed
  when the board fires you or the co-op merges away. Nothing is owed when you resign, the
  contract lapses, or the co-op is liquidated.

## What a co-op GM needs (the stats)

- Kansas State surveyed farmer co-op directors and CEOs/GMs about the skills a co-op leader
  needs: co-op finance, governance and policy, strategic planning, leadership, communication
  and teamwork. The largest gaps were in governance and finance.
  - [K-State fact sheet 18](https://www.agmanager.info/sites/default/files/pdf/FactSheet-18_DirectorSkillsGap_02-01-23.pdf)
  - [K-State fact sheet 19](https://agmanager.info/sites/default/files/pdf/FactSheet-19_DirectorSkills_Paper2_02-21-23.pdf)
- An Illinois study points to financial and business skill, governance, board leadership and
  industry knowledge.
  - [Illinois Experts](https://experts.illinois.edu/en/publications/a-qualitative-assessment-of-farmer-director-skills-in-agricultura/)
- From these, the game's stats are:
  - **Financial acumen**
  - **Operations**
  - **Merchandising & sales** (industry knowledge)
  - **Leadership**
  - **Board relations** (governance)
  - **Member relations** (communication)
  - **Negotiation** (the GM's own contract)
