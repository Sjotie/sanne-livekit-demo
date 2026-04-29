import inspect
import unittest

import pa_agent


class PAAgentContractTest(unittest.TestCase):
    def test_prompt_keeps_werkbank_tool_driven(self):
        prompt = pa_agent.SYSTEM_PROMPT

        self.assertIn("Werkbank-visuals", prompt)
        self.assertIn("echte tools", prompt)
        self.assertIn("geen vaste demo-stappen", prompt)
        self.assertIn("add_note", prompt)
        self.assertIn("Marieke", prompt)
        self.assertIn("Pap", prompt)

    def test_agent_exposes_visual_note_tool(self):
        self.assertTrue(hasattr(pa_agent.PA, "add_note"))
        signature = inspect.signature(pa_agent.PA.add_note)

        self.assertIn("title", signature.parameters)
        self.assertIn("lines", signature.parameters)

    def test_time_helpers_round_trip(self):
        self.assertEqual(pa_agent._time_to_minutes("14:30"), 870)
        self.assertEqual(pa_agent._minutes_to_time(870), "14:30")


if __name__ == "__main__":
    unittest.main()
