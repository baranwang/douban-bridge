import { hydrateRoot } from "react-dom/client";
import { FeedbackForm, type FeedbackFormProps } from "@/components/feedback-form";

const root = document.getElementById("feedback-form");
const initial = JSON.parse(document.getElementById("__FEEDBACK_FORM__")?.textContent || "{}") as FeedbackFormProps;
if (root) hydrateRoot(root, <FeedbackForm {...initial} />);
