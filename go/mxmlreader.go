package main

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io/ioutil"
	"os"
	"strings"
)

type Event struct {
	Name      string `json:"name"`
	EType     string `json:"type"`
	Timestamp string `json:"timestamp"`
}

func readMXML(filepath string) []byte {
	content, err := ioutil.ReadFile(filepath)
	content = append(content, 0)

	var process [][]*Event
	if err == nil {
		var tagStack []string
		var trace []*Event
		var event *Event

		decoder := xml.NewDecoder(bytes.NewBuffer(content))
		for t, err := decoder.Token(); err == nil; t, err = decoder.Token() {
			switch token := t.(type) {
			case xml.StartElement:
				tagStack = append(tagStack, token.Name.Local)
				switch tagStack[len(tagStack)-1] {
				case "ProcessInstance":
					trace = make([]*Event, 0)
				case "AuditTrailEntry":
					event = &Event{}
				default:
				}
			case xml.EndElement:
				endTag := token.Name.Local
				switch endTag {
				case "ProcessInstance":
					if trace != nil {
						process = append(process, trace)
					}
					trace = nil
				case "AuditTrailEntry":
					if event != nil {
						trace = append(trace, event)
					}
					event = nil
				default:
				}
				tagStack = tagStack[:len(tagStack)-1]
			case xml.CharData:
				if len(tagStack) == 0 || event == nil {
					continue
				}
				content := strings.Trim(string([]byte(token)), "\r\n\t ")

				switch tagStack[len(tagStack)-1] {
				case "WorkflowModelElement":
					event.Name = content
				case "EventType":
					event.EType = content
				case "Timestamp":
					event.Timestamp = content
				case "timestamp":
					event.Timestamp = content
				default:
				}
			default:

			}
		}
	}

	type Result struct {
		Err  error      `json:"err"`
		Data [][]*Event `json:"data"`
	}

	data, err := json.Marshal(Result{
		Err:  err,
		Data: process,
	})

	return data
}

func main() {
	bs := readMXML(os.Args[1]) //"C:\\Users\\ciaosu\\Desktop\\drift\\[0 model_cb]-[111 model_IOR]-[222 model_pm]-[360 model_IOR]-[468 model_pm]-[575 model_rp]-[716 model_cf]-[864 model_IRO]-[971 model_lp]-[1140 model_pm]-[1269 end].mxml")
	fmt.Println(string(bs))
}
