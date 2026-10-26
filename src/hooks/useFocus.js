import { useContext } from "react";
import { FocusContext } from "../context/FocusContext";

export default function useFocus() {
  return useContext(FocusContext);
}
