import { useContext } from "react";
import { TransformActionsContext } from "../context/TransformContext";

export default function useTransformActions() {
  return useContext(TransformActionsContext);
}
