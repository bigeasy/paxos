use std::collections::HashMap;

struct Participant{
    id: String,
    // TODO https://stackoverflow.com/a/39147207/90123
    properties: HashMap<String, String>,
    cookie: u64
}

struct Government {
    majority: Vec<String>,
    minority: Vec<String>,
    arrive: Participant,
    acclimate: Option<String>,
}

struct Shape {
    quorum: Vec<String>,
    government: Government,
}

struct Arrival {
    id: String,
    cookie: u64,
}

struct Shaper {
    parliament_size: u32,
    leader: bool,
    arrivals: Vec<String>,
    arriving: Vec<Arrival>,
    decided: bool,
}

impl Shaper {
    pub fn new (parliament_size: u32) -> Shaper {
        Shaper {
            parliament_size: parliament_size,
            leader: false,
            decided: false,
            arrivals: vec![],
            arriving: vec![],
        }
    }
    fn arrival (&mut self) -> Option<Shape> {
        if self.arriving.len() > 0 {
            let arrival = &self.arriving[0];
            return Some(Shape {
                quorum: vec![],
                government: Government {
                    majority: vec![],
                    minority: vec![],
                    arrive: Participant {
                        id: arrival.id.to_string(),
                        properties: HashMap::new(),
                        cookie: 0,
                    },
                    acclimate: None
                }
            })
        }
        return None;
    }
    pub fn emabark (&mut self, arrival: Arrival) {
        for existing in &self.arriving {
            if existing.id == arrival.id {
                return
            }
        }
        self.arriving.push(arrival);
    }
    pub fn arrived (&mut self, id: &String) {
        self.arrivals.push(id.to_string());
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        use crate::Shaper;
        let mut shaper = Shaper::new(3);
        assert!(! shaper.leader);
    }
}
