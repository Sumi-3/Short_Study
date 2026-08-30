import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/remotion/index.ts");
Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setCodec("h264");
