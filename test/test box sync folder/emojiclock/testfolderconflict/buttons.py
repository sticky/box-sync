from gpiozero import Button
from signal import pause
import time

MIN_DURATION_BETWEEN_PRESSES = 0.5
DURATION_HOLD_FOR_CLOCK_SET = 1.5
DURATION_SLEEP_DURING_LOOP = 0.2

class ButtonsHandler(object):
    def __init__(self):
        # state can be "off", "video", "clock"
        self.state = "off"
        self.advanceVideo = False
        self.advanceClock = False
        self.elapsedTime = time.time()
        self.buttonPower = Button(2)
        self.buttonVideo = Button(3)
        self.buttonClock = Button(4)
        
        self.buttonPower.when_pressed = self.onPressPower
        self.buttonVideo.when_pressed = self.onPressVideo
        self.buttonClock.when_pressed = self.onPressClock
        self.buttonClock.when_released = self.onReleaseClock
        
    def printStatus(self):
        print "state:", state, "  advanceVideo:", advanceVideo, "  advanceClock:", advanceClock
    
    def isPressTooHyper(self):e
        t = time.time()
        if t - elapsedTime < MIN_DURATION_BETWEEN_PRESSES:
            return True
        else:
            elapsedTime = t
            return False
    
    def onPressPower(self):
        if self.isPressTooHyper():
            return
        # power button toggles between "off" and "video"
        if self.state == "off":
            self.state = "video"
        else:
        self.state = "off"
    
    def onPressVideo(self):
        if self.isPressTooHyper():
            return
        # video button can be pressed to advance videos
        if self.state == "video":
            self.advanceVideo = True
        else:
            self.advanceVideo = False
            self.state = "video"
    
    def onPressClock(self):
        if self.isPressTooHyper():
            return
        # clock button can be held down to change time
        self.advanceClock = False
        self.state = "clock"
    
    def onReleaseClock(self):
        self.advanceClock = False
    
    def shouldVideoBePlaying(self):
        return self.state == "video"
    
    def shouldVideoAdvance(self):
        if (self.state == "video" and self.advanceVideo):
            self.advanceVideo = False
            return True
        else:
            return False
    
    def shouldClockBePlaying():
        global state
        return state == "clock"
    
    def shouldClockAdvance(self):
        return self.state == "clock" and self.advanceClock;

    def update(self):
           # if the clock button is held down long enough...
        if self.buttonClock.is_pressed and time.time() - elapsedTime > DURATION_HOLD_FOR_CLOCK_SET:
            advanceClock = True
        time.sleep(DURATION_SLEEP_DURING_LOOP)
        #printStatus()
        #print "video:", shouldVideoBePlaying(), " advance:", shouldVideoAdvance()
        #print "clock:", shouldClockBePlaying(), " advance:", shouldClockAdvance()


# Main entry point.
if __name__ == '__main__':
    import logging
    import signal
    logging.basicConfig(level=logging.DEBUG, format='%(levelname)s:%(asctime)s:%(module)s(%(threadName)s): %(message)s')
    logging.info('Starting EmojiClock Display')
    # Create emoji clock display.

    buttons = ButtonsHandler()
    # Configure signal handlers to quit on TERM or INT signal.
    #signal.signal(signal.SIGTERM, buttons.signal_quit)
    #signal.signal(signal.SIGINT, buttons.signal_quit)
    # Run the main loop.
    while 1:
        buttons.update()