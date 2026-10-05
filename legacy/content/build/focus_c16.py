"""C1.6: the remaining Focus content, written from Wired Differently.

Run once to merge into content/workbooks/focus.json. Reader copy is US English,
book voice: second person, short plain sentences, no contractions.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "content" / "workbooks" / "focus.json"
doc = json.loads(PATH.read_text(encoding="utf-8"))


def step(text, figure):
    return {"text": text, "figure": figure}


EX = {}

EX["e03"] = {
    "title": "Turn down your phone's noise",
    "purpose": "A phone that only interrupts you for things that matter, set up once.",
    "why": "Every ping pulls your attention away, and getting it back takes longer than the ping did. Most alerts are apps asking for attention because attention is their business. Sort them once and you stop fighting the same fight dozens of times a day.",
    "source": {"chapter": "Chapter 4, The Notification Audit; Chapter 7, Digital Impulsivity"},
    "minutes": 10,
    "steps": [
        step("Open your phone's notification settings.", "fig_phone_quick"),
        step("Go app by app. Mark each one keep, silence, or remove.", "fig_phone_quick"),
        step("Keep alerts only for calls, texts from close contacts, and your calendar.", "fig_phone_quick"),
        step("Move social apps off your home screen and into a folder.", "fig_phone_quick"),
        step("Set grayscale or Do Not Disturb for the hours you work.", "fig_phone_down"),
    ],
    "example": {"character": "Liam", "text": "When Liam set up his study desk, he asked himself what he actually needed there. His phone made the list on one condition: Do Not Disturb on, and face down. Nothing on it could ping him while he worked. If he wanted to look, he had to turn it over on purpose. Checking it became something he chose to do."},
    "fields": [
        {"id": "f_keep", "type": "short_text", "label": "Apps that keep their alerts"},
        {"id": "f_silence", "type": "long_text", "label": "Apps you silenced or removed"},
        {"id": "f_hours", "type": "short_text", "label": "When your phone goes quiet each day", "help": "For example: 9 to 12, Do Not Disturb, face down."},
    ],
    "short_version": {"minutes": 2, "steps": [step("Silence the three apps that interrupt you most.", "fig_phone_quick")], "field_ids": ["f_silence"]},
    "done_when": "Every app sorted, and quiet hours set on your phone.",
    "repeat_weeks": [7],
    "reflect": "Which alert did you miss least once it was gone?",
    "feeds_plan": [{"field_id": "f_hours", "plan_section": "p3"}],
}

EX["e04"] = {
    "title": "Set up one place to focus",
    "purpose": "One clear surface where your brain knows it is time to work.",
    "why": "Clutter costs attention. Every object in view competes for it, even the ones you are trying to ignore. A clear surface with only what the task needs leaves your brain nothing else to chase. You do not need a separate room. One surface, facing the right way, is enough.",
    "source": {"chapter": "Chapter 4, Workspace Design; Liam's Workspace Transformation"},
    "minutes": 15,
    "steps": [
        step("Pick one surface for focused work, and use it only for that.", "fig_desk_ready"),
        step("Clear everything off it. Everything.", "fig_clear_desk"),
        step("Bring back only what the task in front of you needs.", "fig_desk_ready"),
        step("Turn your seat so you face away from the TV, window, or door.", "fig_desk_ready"),
        step("Add one small lamp or light over the work.", "fig_desk_ready"),
    ],
    "example": {"character": "Liam", "text": "Liam's room had been a mess for years, so he did not try to fix the room. He cleared his study desk completely and piled everything on his bed, so he would have to deal with it before he could sleep. Back on the desk went his laptop, a notebook, a pen, a water bottle, and his phone in Do Not Disturb. He turned the desk to face a blank wall and added a small lamp. It took less than an hour."},
    "fields": [
        {"id": "f_place", "type": "short_text", "label": "Your focus place"},
        {"id": "f_needs", "type": "long_text", "label": "What stays on the surface"},
        {"id": "f_faces", "type": "short_text", "label": "What you face now while you work"},
    ],
    "short_version": {"minutes": 3, "steps": [step("Clear one surface completely. Put back only what today's work needs.", "fig_clear_desk")], "field_ids": ["f_place"]},
    "done_when": "One surface cleared, set up, and facing away from distraction.",
    "reflect": "What did you notice the first time you sat down at it?",
    "feeds_plan": [{"field_id": "f_place", "plan_section": "p3"}],
}

EX["e05"] = {
    "title": "Make the right thing easier",
    "purpose": "Small changes that make good choices easier and unhelpful ones harder, set up in your space.",
    "why": "Tiny obstacles change behavior more than good intentions do. One extra step can be enough to stop you starting. That works both ways. Take steps away from what you want to do. Add steps to what you want to do less. Then the easy path and the right path are the same one.",
    "source": {"chapter": "Chapter 4, The Friction Principle; Environmental Modification Beyond Workspace"},
    "minutes": 10,
    "steps": [
        step("List three things you mean to do but keep skipping.", "fig_writing"),
        step("For each one, remove a step. Lay it out, open it, or put it in view.", "fig_desk_ready"),
        step("List three things you do more than you want to.", "fig_writing"),
        step("For each one, add a step. Log out, move it, or put it in another room.", "fig_phone_down"),
        step("Look at your kitchen, bedroom, and front door for one more change.", "fig_door"),
    ],
    "example": {"character": "Priya", "text": "Priya's office had become a catch-all. Invoices waiting to be sent were mixed in with receipts to file, and important papers went missing. She gave everything a home: a labeled folder for each client, an inbox tray for papers that needed action, and drawer space for supplies. Filing became one step instead of a search. When a client called, she could find their file in seconds instead of digging through piles."},
    "fields": [
        {"id": "f_easier", "type": "two_column", "label": "Things to make easier", "columns": ["What you want to do", "The step you removed"]},
        {"id": "f_harder", "type": "two_column", "label": "Things to make harder", "columns": ["What you want to do less", "The step you added"]},
    ],
    "short_version": {"minutes": 2, "steps": [step("Make one thing easier and one thing harder, today.", "fig_desk_ready")], "field_ids": ["f_easier", "f_harder"]},
    "done_when": "At least one easier and one harder change actually set up, not just written down.",
    "repeat_weeks": [11],
    "reflect": "Which change worked without you having to think about it?",
    "feeds_plan": [{"field_id": "f_easier", "plan_section": "p3"}],
}

EX["e06"] = {
    "title": "Choose one place for everything",
    "purpose": "One trusted place where every task, idea, and promise goes, so nothing lives only in your head.",
    "why": "Your brain can only hold a few things at once, and ADHD lowers that limit. Notes spread across seven places means searching seven places. One place you trust works like an outside brain. You stop keeping things in your head as backup, and you stop losing them in the gaps.",
    "source": {"chapter": "Chapter 5, The Single Capture System; Chapter 1, The Interest-Based Nervous System"},
    "minutes": 15,
    "steps": [
        step("List every place you write things down now, and count them.", "fig_writing"),
        step("Pick one. It has to be with you all day and quick to open.", "fig_phone_quick"),
        step("Move everything from the other places into it.", "fig_folders"),
        step("For three days, put everything in it. Empty it each evening.", "fig_reading"),
        step("When a dull task sits there, give it a deadline, a challenge, or something new.", "fig_thinking"),
    ],
    "example": {"character": "Liam", "text": "Liam had tried planners, apps, and complicated methods. None of them lasted. This time he picked the plainest option he could find: one note on his phone called \"inbox.\" Assignment deadlines, ideas, a reminder to text his mum, things to buy. All of it went there. Every evening he spent five minutes going through it. Some items went into the calendar, some became tomorrow's tasks, and some got deleted. It was almost embarrassingly simple, and it was the first system that stuck."},
    "fields": [
        {"id": "f_places", "type": "long_text", "label": "Every place you write things down now"},
        {"id": "f_one", "type": "short_text", "label": "Your one capture place"},
        {"id": "f_review", "type": "short_text", "label": "When you will empty it each day", "help": "For example: five minutes after dinner."},
    ],
    "short_version": {"minutes": 2, "steps": [step("Name your one capture place, and use only that today.", "fig_phone_quick")], "field_ids": ["f_one"]},
    "done_when": "One capture place chosen, and three days with nothing written anywhere else.",
    "reflect": "What did you catch this week that would have been lost before?",
    "feeds_plan": [{"field_id": "f_one", "plan_section": "p3"}, {"field_id": "f_review", "plan_section": "p4"}],
    "toolkit_link": "t07",
}

EX["e08"] = {
    "title": "Make the important things visible",
    "purpose": "A launch pad by the door, and your priorities and calendar where you will see them.",
    "why": "Out of sight really is out of mind. A task buried in an app you never open may as well not exist. If something matters, put it where your eyes already go: the door you leave by, the wall above your desk, a calendar you pass every day.",
    "source": {"chapter": "Chapter 4, The Visual Thinking System; Chapter 5, The Out-of-Sight Problem"},
    "minutes": 10,
    "steps": [
        step("Choose a launch pad spot by the door for keys, wallet, phone, and bag.", "fig_door"),
        step("Tonight, put anything you must take tomorrow on the launch pad.", "fig_door"),
        step("Write today's priorities where you work, in plain view.", "fig_board"),
        step("Choose one calendar you will actually see: on the wall, on paper, or open on screen.", "fig_calendar"),
    ],
    "example": {"character": "Priya", "text": "Priya put a whiteboard on her office wall showing every client obligation for the month. A calendar next to it held her appointments. Each morning she filled in a simple daily checklist. Nothing important lived only in her head, or in a system she forgot to check. The constant background scan for what she might be forgetting finally eased off."},
    "fields": [
        {"id": "f_launch", "type": "short_text", "label": "Your launch pad spot"},
        {"id": "f_items", "type": "short_text", "label": "What always goes on it"},
        {"id": "f_visible", "type": "short_text", "label": "Where your priorities and calendar live"},
    ],
    "short_version": {"minutes": 1, "steps": [step("Put tomorrow's must-take item by the door tonight.", "fig_door")], "field_ids": ["f_launch"]},
    "done_when": "Launch pad set up, priorities in view, and one calendar chosen.",
    "reflect": "What did you not have to remember this week because you could see it?",
    "feeds_plan": [{"field_id": "f_visible", "plan_section": "p3"}],
}

EX["e09"] = {
    "title": "Run your weekly reset",
    "purpose": "A weekly half hour that catches what fell through the week, before it turns into a crisis.",
    "why": "Your daily plan handles today. The weekly reset handles everything else. Once a week it sweeps your capture place, your calendar, and your desk, and rescues forgotten things while they are still small. The first few take effort. After a while, it becomes something you look forward to.",
    "source": {"chapter": "Chapter 5, The Weekly Reset; Chapter 4, The Maintenance Question; Appendix A"},
    "minutes": 15,
    "steps": [
        step("Pick a fixed day and time, and put it in your calendar.", "fig_calendar"),
        step("Look back: what went well, what slipped, and what you learned.", "fig_thinking"),
        step("Empty your capture place. Do, schedule, or delete each item.", "fig_reading"),
        step("Look at next week's calendar and note what needs preparing.", "fig_calendar"),
        step("Choose next week's top priorities and one likely obstacle.", "fig_three_cards"),
        step("Reset your space. Clear the desk and file the papers.", "fig_clear_desk"),
    ],
    "example": {"character": "Priya", "text": "Every Friday from 4 to 5, Priya runs her reset. She looks back at the week, clears everything that piled up in her inbox, and plans the week ahead. Then she clears her desk, so Monday starts clean. It is the hour where things that slipped during the week get caught, before they turn into problems."},
    "fields": [
        {"id": "f_when", "type": "short_text", "label": "Your reset day and time"},
        {"id": "f_slipped", "type": "long_text", "label": "What slipped this week"},
        {"id": "f_priorities", "type": "ranked_list", "label": "Next week's priorities", "max_items": 3},
        {"id": "f_obstacle", "type": "short_text", "label": "One likely obstacle, and what you will do about it"},
    ],
    "short_version": {"minutes": 3, "steps": [step("Empty your capture place. Nothing else.", "fig_reading")], "field_ids": ["f_slipped"]},
    "done_when": "Capture place empty, next week planned, and the desk clear.",
    "repeat_weeks": [9],
    "reflect": "What did the reset catch that would have become a problem?",
    "feeds_plan": [{"field_id": "f_when", "plan_section": "p4"}],
}

EX["e10"] = {
    "title": "Rewrite the story you tell yourself",
    "purpose": "One harsh line about yourself, checked against the facts and rewritten as a pattern you can change.",
    "why": "Your brain tells you stories about what things mean, and after years of criticism those stories get harsh. They feel like truth. They are interpretations. Rewriting them is not positive thinking. It is accuracy. You are not your behavior. You are a person with patterns, and patterns can change.",
    "source": {"chapter": "Chapter 3, Separating Identity from Behavior; Chapter 6, Rewriting Internal Narratives"},
    "minutes": 10,
    "steps": [
        step("Catch one harsh thing you said to yourself this week. Write it word for word.", "fig_writing"),
        step("Write down only the facts of what happened.", "fig_writing"),
        step("Write two other ways to explain what happened.", "fig_thinking"),
        step("Ask yourself what you would say to a friend who said this.", "fig_thinking"),
        step("Rewrite the line. Swap \"I am\" for \"I have a pattern of.\"", "fig_writing"),
        step("Add one small thing you can do about that pattern.", "fig_writing"),
    ],
    "example": {"character": "Liam", "text": "Liam's line was one he had heard for years: the smart kid who cannot get it together. Teachers told him he was not applying himself. His dad told him to toughen up. By now he said it to himself before he even tried something new. Checked against the facts, it did not hold. His strategies had failed, not his character. His rewrite: \"I have a pattern of scattered behavior, and I can learn to change it.\""},
    "fields": [
        {"id": "f_line", "type": "short_text", "label": "The harsh line, word for word", "help": "Notice if a small comment from someone felt like a big blow. That often sets these lines off."},
        {"id": "f_facts", "type": "long_text", "label": "The facts only"},
        {"id": "f_other", "type": "ranked_list", "label": "Two other explanations", "max_items": 2},
        {"id": "f_rewrite", "type": "short_text", "label": "Your rewrite", "help": "Start with \"I have a pattern of\" and add one thing you can do."},
    ],
    "short_version": {"minutes": 2, "steps": [step("Rewrite one \"I am\" line as \"I have a pattern of.\"", "fig_writing")], "field_ids": ["f_rewrite"]},
    "done_when": "One harsh line rewritten as a pattern, with one thing you can do about it.",
    "repeat_weeks": [12],
    "reflect": "How does the new line feel when you read it back?",
}

EX["e11"] = {
    "title": "Decide now: when this, then that",
    "purpose": "Up to five ready-made responses for the moments when you most often slip.",
    "why": "Deciding in the moment is hard when your brakes are slow. So decide ahead, while you are calm. A plan in the form \"when this happens, I will do that\" means the choice is already made when the moment comes. You do not have to find the willpower. You just follow the plan.",
    "source": {"chapter": "Chapter 7, Implementation Intentions"},
    "minutes": 10,
    "steps": [
        step("Name your three most common slip moments. Be specific about where and when.", "fig_thinking"),
        step("For each one, write: when this happens, then you will do this.", "fig_writing"),
        step("Make each action small enough to do on a bad day.", "fig_writing"),
        step("Put the plans somewhere you will see them, like your lock screen.", "fig_phone_quick"),
        step("Read them each morning for a week.", "fig_reading"),
    ],
    "example": {"character": "Liam", "text": "Liam noticed that his phone checking was worst in the first fifteen minutes of any study session, when the work felt most boring. So he made a plan: \"When I sit down to study, my phone goes in my backpack for twenty minutes.\" By the time twenty minutes had passed, he was usually into the material and the urge had faded. The plan did the job his willpower could not."},
    "fields": [
        {"id": "f_moments", "type": "ranked_list", "label": "Your three slip moments", "max_items": 3},
        {"id": "f_plans", "type": "two_column", "label": "Your plans", "columns": ["When this happens", "Then you will"]},
    ],
    "short_version": {"minutes": 2, "steps": [step("Write one plan for the moment you slip most.", "fig_writing")], "field_ids": ["f_plans"]},
    "done_when": "Up to five plans written, each small enough to follow on a bad day.",
    "repeat_weeks": [11],
    "reflect": "Which plan kicked in without you having to think about it?",
    "feeds_plan": [{"field_id": "f_plans", "plan_section": "p5"}],
    "toolkit_link": "t02",
}

EX["e12"] = {
    "title": "Build your brakes",
    "purpose": "Two outside brakes, set up while you are calm, for the area where acting fast costs you most.",
    "why": "When the brake inside is slow, build one outside. A saved card removed, a site blocker, a rule to wait, a person to call first. None of these are signs of weakness. They are practical fixes for a known problem, and they hold even when your judgment in the moment would not.",
    "source": {"chapter": "Chapter 7, Creating External Brakes; The Four Domains of Impulsivity; The 24-Hour Rule; Decision Impulsivity"},
    "minutes": 10,
    "steps": [
        step("Pick the area that costs you most: money, words, big decisions, or screens.", "fig_thinking"),
        step("Write down what usually sets it off, like boredom or a hard day.", "fig_writing"),
        step("Choose two brakes from the list, or make your own.", "fig_hand_raised"),
        step("Set them up today, while you are calm.", "fig_phone_down"),
        step("Tell one person about them, if that will help them stick.", "fig_two_people"),
    ],
    "example": {"character": "Priya", "text": "On client calls, Priya had a habit of saying whatever came into her head, and it sometimes made things awkward. Her brake was a notepad next to the phone. When she felt the urge to jump in, she wrote the thought down instead. After the call she read her notes and decided what, if anything, needed saying. Most of it did not. Over time the pause came on its own, even without the notepad."},
    "fields": [
        {"id": "f_area", "type": "short_text", "label": "The area that costs you most"},
        {"id": "f_triggers", "type": "short_text", "label": "What usually sets it off"},
        {"id": "f_brakes", "type": "checklist", "label": "Brakes to choose from", "options": [
            "Saved cards removed from shopping sites",
            "Shopping apps deleted from your phone",
            "A 24-hour wait before any non-essential buy",
            "A site or app blocker during set hours",
            "Phone charged in another room at night",
            "Upset messages saved as drafts first",
            "Two days and one trusted opinion before any big decision",
            "A notepad for what you want to say",
        ]},
        {"id": "f_mine", "type": "short_text", "label": "Your two brakes, in your own words"},
    ],
    "short_version": {"minutes": 2, "steps": [step("Set up one brake today.", "fig_hand_raised")], "field_ids": ["f_mine"]},
    "done_when": "Two brakes chosen and actually set up.",
    "reflect": "When did a brake catch you this week?",
    "feeds_plan": [{"field_id": "f_mine", "plan_section": "p5"}],
    "toolkit_link": "t04",
}

EX["e13"] = {
    "title": "Become someone who follows through",
    "purpose": "A simple system so promises, deadlines, and follow-ups stop slipping.",
    "why": "Reliability is not a personality trait. It is a system. Every promise goes somewhere you will see it. Every deadline gets reminders early enough to act on. Every request you send gets a date to chase it. Nothing depends on remembering, and that is the point.",
    "source": {"chapter": "Chapter 8, The Reliability System; Communication as Professional Infrastructure"},
    "minutes": 10,
    "steps": [
        step("Put every promise you make into your capture place, the same day.", "fig_writing"),
        step("Give each deadline three reminders: a week, two days, and one day before.", "fig_calendar"),
        step("When you send a request, add a date to follow up if you hear nothing.", "fig_calendar"),
        step("Reply to messages within a day, even just to say when you will answer.", "fig_phone_quick"),
        step("If it helps, send one person a short update each week.", "fig_two_people"),
    ],
    "example": {"character": "Priya", "text": "Priya's biggest change at work was not a better way to track deadlines, though that helped. It was a short weekly update to each of her main clients: what she had finished, what was coming next, and any questions. It took fifteen minutes in total. Clients who used to wonder whether she was on top of things stopped wondering, because she told them first."},
    "fields": [
        {"id": "f_promises", "type": "long_text", "label": "Promises you have made that are not written down yet"},
        {"id": "f_deadline", "type": "two_column", "label": "Deadlines and their reminders", "columns": ["Deadline", "Reminder dates"]},
        {"id": "f_update", "type": "short_text", "label": "Who gets a weekly update, and when", "optional": True},
    ],
    "short_version": {"minutes": 2, "steps": [step("Add three reminders to one real deadline.", "fig_calendar")], "field_ids": ["f_deadline"]},
    "done_when": "Open promises captured, and at least one deadline set with three reminders.",
    "reflect": "Which promise would have slipped if it had not been written down?",
}

EX["e14"] = {
    "title": "Plan backward from a deadline",
    "purpose": "One real deadline broken into dated milestones, each with its own small deadline.",
    "why": "A deadline that is far away gives your brain no urgency, so nothing happens until the last minute. Working backward turns one distant date into several close ones. Each milestone brings its own small deadline, and small deadlines are what get you started.",
    "source": {"chapter": "Chapter 8, The Reliability System; Liam's Academic Turnaround"},
    "minutes": 10,
    "steps": [
        step("Pick one real deadline in the next month or two.", "fig_calendar"),
        step("Ask what has to be done just before it. Write that down.", "fig_thinking"),
        step("Keep working backward until you reach something you could start this week.", "fig_writing"),
        step("Aim for three to five milestones, each with a date.", "fig_board"),
        step("Put each milestone in your calendar with a reminder.", "fig_calendar"),
    ],
    "example": {"character": "Liam", "text": "Liam's dissertation had one deadline at the end of the semester, which made it feel like a problem for later. He broke it into weekly milestones and tracked them on a whiteboard. His supervisor helped too, splitting it into smaller pieces with their own deadlines. Every week now had a finish line. By the end of the semester his grades were the best they had been in years, and he was working fewer hours, not more."},
    "fields": [
        {"id": "f_deadline", "type": "short_text", "label": "The deadline"},
        {"id": "f_milestones", "type": "two_column", "label": "Your milestones", "columns": ["Milestone", "Date"]},
        {"id": "f_first", "type": "short_text", "label": "The first milestone, and when you will start it"},
    ],
    "short_version": {"minutes": 2, "steps": [step("Set the first milestone and put it in your calendar.", "fig_calendar")], "field_ids": ["f_first"]},
    "done_when": "Three to five milestones, each with a date in your calendar.",
    "reflect": "How did the first milestone feel compared with the whole deadline?",
}

EX["e15"] = {
    "title": "Build a morning that runs itself",
    "purpose": "A fixed morning you can follow without deciding anything, plus a three-step version for bad days.",
    "why": "Every decision in the morning uses up focus you need later. A routine removes those decisions. Same steps, same order, same time, until it runs on autopilot. Give it more time than you think it needs, because mornings always run long. Keep a minimum version for days when the full one is not possible.",
    "source": {"chapter": "Chapter 5, Routines as Cognitive Relief; Chapter 9, Building Sustainable Routines; Chapter 12, Building Your Morning Routine"},
    "minutes": 15,
    "steps": [
        step("Set one wake time for every day, weekends included.", "fig_clock_check"),
        step("List five to eight steps in order, from waking up to starting your day.", "fig_writing"),
        step("Include some movement, even ten minutes of walking.", "fig_walking"),
        step("Time the whole thing, then add a third more as a buffer.", "fig_clock_check"),
        step("Move one decision to the night before, like clothes or your bag.", "fig_door"),
        step("Write a three-step minimum version for hard days.", "fig_writing"),
    ],
    "example": {"character": "Priya", "text": "Priya wakes at 6:30 every day, weekends too. She walks around the neighborhood for thirty minutes, which gets her moving and out in the morning light. Then a shower, getting dressed, breakfast sitting down with no screens, and ten minutes of planning at the kitchen table. By 8:00 she is at her desk on her hardest client task. She does not decide any of it. It just runs."},
    "fields": [
        {"id": "f_wake", "type": "time_of_day", "label": "Your wake time"},
        {"id": "f_steps", "type": "ranked_list", "label": "Your morning, in order", "max_items": 8},
        {"id": "f_min", "type": "ranked_list", "label": "Your three-step minimum morning", "max_items": 3},
        {"id": "f_night", "type": "short_text", "label": "What you will decide the night before"},
        {"id": "f_pair", "type": "short_text", "label": "If you take a prescribed medication, which step will you pair it with?", "optional": True},
    ],
    "short_version": {"minutes": 2, "steps": [step("Write your three-step minimum morning.", "fig_writing")], "field_ids": ["f_min"]},
    "done_when": "A written morning in order, with a buffer, and a three-step minimum.",
    "reflect": "Which step of your morning is the one that holds the rest together?",
    "feeds_plan": [{"field_id": "f_steps", "plan_section": "p4"}, {"field_id": "f_min", "plan_section": "p6"}],
}

EX["e16"] = {
    "title": "Smooth your hardest switch",
    "purpose": "An alarm and a small ritual for the two moments in your day when switching is hardest.",
    "why": "Stopping something absorbing is hard because it feels good. Starting something dull is hard because it does not. Your sense of time will not warn you in either case. So build the switch outside your head: an alarm before it, a short ritual to mark it, and five minutes to get started.",
    "source": {"chapter": "Chapter 12, Managing Transitions; Priya's Daily Operating System"},
    "minutes": 10,
    "steps": [
        step("Name your two hardest switches, like stopping a game or starting admin.", "fig_thinking"),
        step("Set an alarm five minutes before each one, so you can wrap up.", "fig_clock_check"),
        step("Set a second alarm for the switch itself.", "fig_clock_check"),
        step("Pick a short ritual to mark the change: tea, a walk, closing the laptop.", "fig_walking"),
        step("Give the new task just five minutes. Then decide whether to keep going.", "fig_desk_ready"),
    ],
    "example": {"character": "Priya", "text": "Priya ends her working day at 5:00, the same way every time. A five-minute desk reset: she clears the surface, files her papers, looks at tomorrow's calendar, and closes the laptop. Closing it is the signal. Work is done. Dinner is at 6:00, then time with Michael without screens. The ritual marks the line between the two parts of her day, so work does not trail into the evening."},
    "fields": [
        {"id": "f_switches", "type": "two_column", "label": "Your two hardest switches", "columns": ["The switch", "Your ritual"]},
        {"id": "f_alarms", "type": "short_text", "label": "The alarm times you set"},
        {"id": "f_start", "type": "short_text", "label": "What your five-minute start looks like", "optional": True},
    ],
    "short_version": {"minutes": 1, "steps": [step("Set one alarm for your hardest switch.", "fig_clock_check")], "field_ids": ["f_alarms"]},
    "done_when": "Two switches named, each with an alarm and a ritual.",
    "reflect": "Which switch got easier, and what made the difference?",
    "feeds_plan": [{"field_id": "f_switches", "plan_section": "p4"}],
    "toolkit_link": "t05",
}

EX["e17"] = {
    "title": "Guard your best hours",
    "purpose": "One protected block in your best hours, kept clear of meetings, messages, and admin.",
    "why": "Two protected hours at your peak can get more done than a whole scattered day. Spend them on email and they are gone. Keep them for the work that needs your sharpest thinking, and move routine tasks to the hours when your focus dips anyway.",
    "source": {"chapter": "Chapter 8, Energy Management; Chapter 12, Protecting Your Peak Hours"},
    "minutes": 10,
    "steps": [
        step("Look at your energy map from weeks 2 and 10. Find your peak.", "fig_looking_at_map"),
        step("Block one protected slot in your calendar, starting tomorrow.", "fig_calendar"),
        step("Choose the one task that needs your sharpest thinking for that slot.", "fig_three_cards"),
        step("Set your space: phone away, blocker on, door closed if you can.", "fig_phone_down"),
        step("Move email, calls, and admin to your lower hours.", "fig_clock_check"),
    ],
    "example": {"character": "Priya", "text": "Priya's peak is the start of her working day. From 8:00 she works on her most complex client account, with her phone in another room and no email until 10:00. Calls, admin, and the inbox wait for the afternoon, when her focus is lower anyway. Those first two hours are where her hardest work gets done."},
    "fields": [
        {"id": "f_peak", "type": "short_text", "label": "Your peak hours"},
        {"id": "f_block", "type": "short_text", "label": "The block you are protecting"},
        {"id": "f_task", "type": "short_text", "label": "What goes in it"},
        {"id": "f_low", "type": "short_text", "label": "What moves to your lower hours"},
    ],
    "short_version": {"minutes": 2, "steps": [step("Block one hour tomorrow for your hardest task.", "fig_calendar")], "field_ids": ["f_block"]},
    "done_when": "One block protected in your calendar, with its task and space set.",
    "reflect": "What got done in your protected block that usually does not?",
    "feeds_plan": [{"field_id": "f_block", "plan_section": "p2"}],
}

EX["e18"] = {
    "title": "Set your sleep anchor",
    "purpose": "A fixed wake time and a simple evening routine that protect your sleep.",
    "why": "Sleep holds up everything else in this workbook. One bad night weakens attention, memory, and impulse control. Many people with ADHD feel most awake late at night. The wake time is your anchor. Keep it fixed, get morning light, and your body clock slowly shifts earlier.",
    "source": {"chapter": "Chapter 9, Sleep: The Non-Negotiable Foundation; Chapter 12, Building Your Evening Routine; Appendix A"},
    "minutes": 10,
    "steps": [
        step("Choose a wake time you can keep every day, weekends included.", "fig_clock_check"),
        step("Choose a time for your last caffeine of the day. Early afternoon works for many people.", "fig_clock_check"),
        step("Choose when your wind-down starts, one to two hours before bed.", "fig_moon"),
        step("Charge your phone outside the bedroom.", "fig_phone_down"),
        step("Keep a notepad by the bed for thoughts that will not settle.", "fig_writing"),
        step("Get outside in daylight soon after you wake up.", "fig_walking"),
        step("If poor sleep goes on for weeks, talk to your doctor.", "fig_two_people"),
    ],
    "example": {"character": "Liam", "text": "Liam stayed up until 2 most nights, gaming or scrolling, then dragged himself to 9 a.m. classes feeling foggy. He was not tired any earlier. His body clock ran late. What changed it was the walk to campus in the morning light. Within two weeks of walking every morning, he found himself getting sleepy earlier in the evening."},
    "fields": [
        {"id": "f_wake", "type": "time_of_day", "label": "Your wake time"},
        {"id": "f_caffeine", "type": "time_of_day", "label": "Your last caffeine of the day"},
        {"id": "f_wind", "type": "time_of_day", "label": "When your wind-down starts"},
        {"id": "f_phone", "type": "short_text", "label": "Where your phone charges at night"},
    ],
    "short_version": {"minutes": 1, "steps": [step("Set your wake time, and keep it tomorrow.", "fig_clock_check")], "field_ids": ["f_wake"]},
    "done_when": "Wake time, caffeine cut-off, and wind-down set, and the phone out of the bedroom.",
    "reflect": "What was hardest to keep this week, and what would make it easier?",
    "feeds_plan": [{"field_id": "f_wake", "plan_section": "p4"}, {"field_id": "f_wind", "plan_section": "p4"}],
}

EX["e19"] = {
    "title": "Ask for one kind of help",
    "purpose": "One specific request for the kind of support you are missing most.",
    "why": "Managing ADHD alone is like running a marathon without proper shoes. It can be done, but it is harder than it needs to be. Support comes in four kinds: information, encouragement, practical help, and someone who checks in. Most people need some of each. A small, clear ask is easy to say yes to.",
    "source": {"chapter": "Chapter 11, Types of Support; Building an Accountability System; Body Doubling; How to Ask for Help Effectively"},
    "minutes": 10,
    "steps": [
        step("Check which kind of support you have least of.", "fig_thinking"),
        step("Name one person who could give it. Someone to work beside you counts.", "fig_two_people"),
        step("Write the ask. Make it specific, give a short reason, and keep it small.", "fig_writing"),
        step("Decide how you will take a no. It is about their time, not your worth.", "fig_thinking"),
        step("After they help, tell them what difference it made.", "fig_two_people"),
    ],
    "example": {"character": "Liam", "text": "Liam and a friend who was also writing a dissertation agreed to check in every Sunday evening for thirty minutes. Three questions each: what did you get done, what did you not get done, and what are your three priorities for next week? It was not about pressure. It was about someone else knowing. \"Work on my dissertation\" turned into \"finish the literature review by Sunday,\" and that made the difference."},
    "fields": [
        {"id": "f_kind", "type": "checklist", "label": "The support you have least of", "options": ["Information", "Encouragement", "Practical help", "Someone who checks in"]},
        {"id": "f_person", "type": "short_text", "label": "Who you will ask"},
        {"id": "f_ask", "type": "long_text", "label": "Your ask, as you will say it"},
    ],
    "short_version": {"minutes": 2, "steps": [step("Name one person and the one thing you will ask them for.", "fig_two_people")], "field_ids": ["f_person"]},
    "done_when": "One ask written, and sent or given a time to say it.",
    "reflect": "How did asking feel, compared with what you expected?",
}

EX["e20"] = {
    "title": "Repair one thing",
    "purpose": "A short, calm repair for one recent slip that affected someone.",
    "why": "Slips will happen. What rebuilds trust is how you handle them. A good repair has three parts: own what happened, explain it without excusing it, and say what will change. A mistake followed by a quick repair can build more trust than no mistake at all, because it shows you can recover.",
    "source": {"chapter": "Chapter 10, Practical Strategies for Relationship Repair; Repairing Trust"},
    "minutes": 10,
    "steps": [
        step("Pick one recent slip that affected someone: a partner, friend, relative, or colleague.", "fig_two_people"),
        step("Line one: say what happened and how it affected them.", "fig_writing"),
        step("Line two: say what made it hard, without using it as an excuse.", "fig_writing"),
        step("Line three: say what will change, and how you will set that up.", "fig_writing"),
        step("Choose a calm time to say it, not in the middle of an argument.", "fig_clock_check"),
        step("Afterward, write down how it went.", "fig_writing"),
    ],
    "example": {"character": "Priya", "text": "Priya told her husband, Michael, she would call the insurance company. Three days later it still was not done, and he only found out when he tried to follow up. Her repair was three lines: \"I know it was frustrating when I forgot to call. My ADHD makes that kind of task hard, but that does not make your frustration less valid. Here is how I will stop it happening next time.\" Then she put the call in her system."},
    "fields": [
        {"id": "f_slip", "type": "short_text", "label": "The slip, and who it affected"},
        {"id": "f_lines", "type": "ranked_list", "label": "Your three lines", "max_items": 3},
        {"id": "f_when", "type": "short_text", "label": "When you will say it"},
        {"id": "f_after", "type": "long_text", "label": "How it went", "optional": True},
    ],
    "short_version": {"minutes": 2, "steps": [step("Write the three lines. Saying them can wait.", "fig_writing")], "field_ids": ["f_lines"]},
    "done_when": "Three lines written and a calm time chosen to say them.",
    "reflect": "What did you learn from how they responded?",
    "toolkit_link": "t09",
}

EX["e21"] = {
    "title": "Write your daily operating system",
    "purpose": "One page that shows how an ordinary day runs, built from what you have already worked out.",
    "why": "A system that lives only in your head is not a system. It is a hope. Over twelve weeks you have worked out your best hours, your morning, your planning time, your sleep, and your reset. This page puts them in one place, so most of tomorrow's decisions are already made.",
    "source": {"chapter": "Chapter 12, The Daily Operating System; Designing Your Ideal Day"},
    "minutes": 15,
    "steps": [
        step("Read the draft below. It is built from your earlier answers.", "fig_reading"),
        step("Check your morning: wake time and the steps in order.", "fig_writing"),
        step("Mark your protected block and when your breaks happen.", "fig_calendar"),
        step("Add your hardest switch and how you handle it.", "fig_clock_check"),
        step("Check your evening: when wind-down starts and when you sleep.", "fig_moon"),
        step("Add your weekly reset day and time.", "fig_calendar"),
        step("Read it through. Cut anything you would not do on an ordinary day.", "fig_reading"),
    ],
    "example": {"character": "Priya", "text": "Priya's day, trimmed down: wake at 6:30, walk, breakfast, plan at the kitchen table. Hardest client work from 8:00, phone in another room, no email until 10:00. Lunch away from the desk. Calls and admin in the afternoon, inbox at 3:00. A five-minute desk clear at 5:00. Dinner at 6:00, wind-down at 9:00, asleep by 10:00. Weekly reset on Friday at 4:00. It is not rigid, but the anchors stay fixed."},
    "fields": [
        {"id": "f_morning", "type": "long_text", "label": "Morning"},
        {"id": "f_work", "type": "long_text", "label": "Your best hours and breaks"},
        {"id": "f_switch", "type": "short_text", "label": "Your hardest switch and how you handle it"},
        {"id": "f_evening", "type": "long_text", "label": "Evening"},
        {"id": "f_week", "type": "short_text", "label": "Weekly reset"},
    ],
    "short_version": {"minutes": 3, "steps": [step("Read the drafted morning and evening. Fix anything that is wrong.", "fig_reading")], "field_ids": ["f_morning", "f_evening"]},
    "done_when": "One page, read through, that you would follow on an ordinary day.",
    "reflect": "Which anchor on this page matters most to you?",
    "feeds_plan": [
        {"field_id": "f_morning", "plan_section": "p4"},
        {"field_id": "f_work", "plan_section": "p4"},
        {"field_id": "f_evening", "plan_section": "p4"},
        {"field_id": "f_week", "plan_section": "p4"},
    ],
}

EX["e22"] = {
    "title": "Write your restart plan",
    "purpose": "A short plan for getting back on track after a bad patch, written while you are steady.",
    "why": "Your system will break down sometimes. That is normal. What matters is the return. Someone who restarts after three bad days is doing better than someone who gives up after one. Write the restart now, while you are steady, so getting back after a bad week takes one step.",
    "source": {"chapter": "Chapter 12, The Imperfect System; Building Gradually; Chapter 10, Priya and Michael's Turning Point"},
    "minutes": 10,
    "steps": [
        step("Write your first step back. For most people, it is tomorrow's ten-minute plan.", "fig_writing"),
        step("Copy in your three-step minimum morning.", "fig_writing"),
        step("Name one person you will tell when things slide.", "fig_two_people"),
        step("List what you will drop first to make room.", "fig_writing"),
        step("Keep the plan where you will find it on a bad day.", "fig_phone_quick"),
    ],
    "example": {"character": "Priya", "text": "When Priya missed something, she used to get defensive, then tearful, and the conversation with Michael went nowhere. Now, when he points out a task she forgot, she says: \"You are right. I missed that. Let me add it to my system right now.\" No spiral and no long apology. The slip goes into her capture place, and her system carries on. That is a restart at its smallest: one plain step back into the system, taken straight away."},
    "fields": [
        {"id": "f_first", "type": "short_text", "label": "Your first step back"},
        {"id": "f_min", "type": "ranked_list", "label": "Your minimum day", "max_items": 3},
        {"id": "f_tell", "type": "short_text", "label": "Who you will tell"},
        {"id": "f_drop", "type": "long_text", "label": "What you will drop first"},
    ],
    "short_version": {"minutes": 1, "steps": [step("Write your first step back. Just that.", "fig_writing")], "field_ids": ["f_first"]},
    "done_when": "A restart plan with a first step, a minimum day, one person, and what to drop.",
    "reflect": "What would you want to hear from yourself on a bad day?",
    "feeds_plan": [{"field_id": "f_first", "plan_section": "p6"}, {"field_id": "f_drop", "plan_section": "p6"}],
    "toolkit_link": "t10",
}

TK = {
    "t03": {"title": "Impulse check", "when_to_use": "You are tempted to do something you might regret.",
            "steps": ["Name exactly what you are about to do.", "Ask what it will cost you, now and later.",
                      "Ask what you actually want underneath the urge.", "Pick another way to meet that need."],
            "minutes": 1, "figure": "fig_thinking", "source": {"chapter": "Appendix A, The Impulse Interruption Script"}},
    "t04": {"title": "The 24-hour rule", "when_to_use": "You want to buy something right now, and it is not essential.",
            "steps": ["Add it to a wishlist or cart. Do not buy yet.", "Close the page and wait 24 hours.",
                      "Tomorrow, ask if you still want it and if it is worth it.", "Still yes? Buy it. Urge gone? Delete it."],
            "minutes": 1, "figure": "fig_clock_check", "source": {"chapter": "Chapter 7, The 24-Hour Rule; Appendix A"}},
    "t05": {"title": "Five-minute start", "when_to_use": "You cannot make yourself begin.",
            "steps": ["Pick the smallest first action, like opening the file.", "Set a timer for five minutes.",
                      "Work only until it rings.", "Then choose: keep going, or stop for now."],
            "minutes": 1, "figure": "fig_clock_check", "source": {"chapter": "Chapter 12, Managing Transitions"}},
    "t06": {"title": "Draft, do not send", "when_to_use": "You are upset and about to send a message.",
            "steps": ["Write the message if you need to get it out.", "Save it as a draft. Do not send it.",
                      "Come back in an hour, or tomorrow morning.", "Read it again, calmer. Edit, send, or delete."],
            "minutes": 1, "figure": "fig_phone_quick", "source": {"chapter": "Chapter 7, Verbal Impulsivity"}},
    "t07": {"title": "Park the thought", "when_to_use": "A thought will not let go, in a meeting or at bedtime.",
            "steps": ["Grab your capture place, or the notepad by the bed.", "Write the thought down in a few words.",
                      "Tell yourself it is saved and will be there later.", "Go back to what you were doing, or to sleep."],
            "minutes": 1, "figure": "fig_writing", "source": {"chapter": "Chapter 7, Verbal Impulsivity; Chapter 9, Sleep"}},
    "t08": {"title": "Clear surface reset", "when_to_use": "It is the end of your working day.",
            "steps": ["File, act on, or tray every loose paper.", "Put everything back in its home.",
                      "Set out what you need for tomorrow's first task.", "Leave the surface clear."],
            "minutes": 2, "figure": "fig_clear_desk", "source": {"chapter": "Chapter 4, Priya's Home Office; The Maintenance Question"}},
    "t09": {"title": "Repair in three lines", "when_to_use": "You slipped, and it affected someone.",
            "steps": ["Say what happened and how it affected them.", "Say what made it hard, without excusing it.",
                      "Say what will change, and how.", "Then listen."],
            "minutes": 2, "figure": "fig_two_people", "source": {"chapter": "Chapter 10, Practical Strategies for Relationship Repair"}},
    "t10": {"title": "Restart with one step", "when_to_use": "You have had a bad few days and your routines have slipped.",
            "steps": ["Skip the guilt. Slips are part of this.", "Do one thing: plan tomorrow in ten minutes.",
                      "Keep tomorrow to your minimum day.", "Add one routine back each day after that."],
            "minutes": 1, "figure": "fig_walking", "source": {"chapter": "Chapter 12, The Imperfect System"}},
}

WEEK_FOCUS = {
    3: "Set up your phone and your space",
    4: "Make good choices the easy ones",
    5: "Plan your day and keep it in view",
    6: "Catch what slips, and quiet the critic",
    7: "Decide ahead and build your brakes",
    8: "Follow through on what you promise",
    9: "Mornings and hard switches",
    10: "Your best hours and your sleep",
    11: "Ask for help and repair what slipped",
    12: "Put it all on one page",
}
WEEK_TOOLS = {3: ["t08"], 4: ["t05"], 5: ["t07"], 6: ["t06"], 7: ["t03", "t04"], 11: ["t09"], 12: ["t10"]}

STAGES = {
    "build": {"primer": {"title": "Set up your days to work for you", "figure": "fig_desk_ready",
                         "body": "You now know where things go wrong and when your brain works best. The next five weeks build the setup around you: a quieter phone, one place to focus, one place for everything, a daily plan, a weekly reset, and a few ready-made brakes. None of it depends on willpower. Each piece makes the right thing a little easier, and they add up. Some of it will feel awkward at first. That usually just means it is new."},
              "outcome": "A setup that works with your brain: phone, space, capture place, daily plan, weekly reset, and brakes.",
              "review_question": "Which part of your setup made the biggest difference, and which part has not stuck yet?"},
    "use": {"primer": {"title": "Test it on real life", "figure": "fig_walking",
                       "body": "A setup only counts if it holds up in a busy week. These four weeks take it to the places where things usually go wrong: deadlines, mornings, switching between tasks, sleep, and the people around you. You will also ask for one kind of help and repair one thing that slipped. Some of it will not work the first time. When that happens, change the system, not your opinion of yourself."},
            "outcome": "Your setup tested on deadlines, mornings, sleep, and the people in your life.",
            "review_question": "Where did your setup hold up best, and where did it need changing?"},
    "keep": {"primer": {"title": "Make it yours to keep", "figure": "fig_writing",
                        "body": "This last week turns twelve weeks of work into two pages you can keep using. One shows how an ordinary day runs. The other shows how to get back on track after a bad patch, because there will be bad patches. Neither needs to be perfect. Each just needs to be clear enough to follow on a tired Tuesday."},
             "outcome": "Your daily operating system and your restart plan, both saved in My Plan.",
             "review_question": "What will you keep doing now that the twelve weeks are done?"},
}

# ---- merge ----
for e in doc["exercises"]:
    if e["id"] in EX:
        new = {"id": e["id"], **EX[e["id"]]}
        e.clear()
        e.update(new)
for t in doc["toolkit"]:
    if t["id"] in TK:
        new = {"id": t["id"], **TK[t["id"]]}
        t.clear()
        t.update(new)
for w in doc["weeks"]:
    if w["number"] in WEEK_FOCUS:
        w["focus"] = WEEK_FOCUS[w["number"]]
    if w["number"] in WEEK_TOOLS:
        w["new_toolkit_ids"] = WEEK_TOOLS[w["number"]]
for s in doc["stages"]:
    if s["id"] in STAGES:
        s.update(STAGES[s["id"]])
doc["finish"]["summary"] = ("Twelve weeks ago you rated five thinking skills and tracked your energy. Since then you have built a "
                            "setup around how your brain works, tested it on real life, and written it down. It will not run "
                            "perfectly, and it does not have to. When it slips, you have a way back.")
doc["keep_going"]["monthly_questions"] = [
    "Which part of your setup is working without you having to think about it?",
    "What slipped this month, and what is one step back?",
]
doc["cut_log"] = doc.get("cut_log", []) + [
    {"item": "E19 partner link", "chapter": "Chapter 11", "reason": "The in-app partner feature is not built yet, so the exercise does not mention it. Add one line when it ships."},
    {"item": "E15 medication", "chapter": "Chapter 9, Medication; Chapter 12", "reason": "Only the optional pairing question. Priya's medication step from the book is left out of her example."},
    {"item": "E18 melatonin", "chapter": "Chapter 9, Sleep", "reason": "Left out, per blueprint. A doctor step is included instead."},
]
doc["status"] = "in_review"
PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("merged", len(EX), "exercises and", len(TK), "cards")
